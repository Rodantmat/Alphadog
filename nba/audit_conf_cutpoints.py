#!/usr/bin/env python3
"""
AUDIT - build_final_hp.conf_cutpoints() equals the SQL percentile_cont it replaced (2026-10-20, P3 speed-up). READ-ONLY.
For three populations (a live slate excluded, a past date excluded, a season rebuild excluding a season) compares
percentile_cont(ARRAY[0.25,0.50,0.75]) WITHIN GROUP (ORDER BY confidence) with conf_cutpoints() - PASS = bit-identical floats -
and prints the seconds of each. Env: DATABASE_URL.
"""
import os
import sys
import time

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_final_hp as B   # noqa: E402

SQL = """SELECT percentile_cont(ARRAY[0.25,0.50,0.75]) WITHIN GROUP (ORDER BY confidence)
         FROM nba_score.final_hp
         WHERE confidence IS NOT NULL
           AND (CASE WHEN %(d)s <> '' THEN game_date <> NULLIF(%(d)s, '')::date
                     ELSE NOT (season = ANY(%(s)s)) END)"""


def main():
    ok = True
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("SET statement_timeout = 0")
        for d, s in (("2026-10-20", []), ("2026-03-15", []), ("", ["2025-26"])):
            t0 = time.time()
            old = [float(x) for x in c.execute(SQL, {"d": d, "s": s}).fetchone()[0]]
            t_old = time.time() - t0
            t0 = time.time()
            new = B.conf_cutpoints(c, d, s)
            t_new = time.time() - t0
            same = old == new
            ok = ok and same
            print(f"population excl {d or s}: sql {old} in {t_old:.1f}s | conf_cutpoints {new} in {t_new:.1f}s | identical {same}", flush=True)
    print("AUDIT_PASS" if ok else "AUDIT_FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
