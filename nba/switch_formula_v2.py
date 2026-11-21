#!/usr/bin/env python3
"""
SWITCH TO THE ONE-FORMULA STORE (owner 2026-11-20 20:58 PT: "run the same formula for every single day ... a homogeneous formula throughout the
whole dataset and back data"). Run ONLY after the replayed store is proven (NBA_HONEST_REBUILD.md 8av).
  1. PREFLIGHT  every _v2 table exists; per table, dates covered vs production; every slate date of production present in baseline_history_v2.
  2. INDEXES    every index of a production table is recreated on its _v2 twin (same definition) so the live code finds the same access paths.
  3. SWAP       one transaction: production table -> <name>_pre_v2 (kept, nothing deleted), <name>_v2 -> production name; index names swapped the
                same way; the view nba_score.final_hp_all re-created on the new tables.
Env: DATABASE_URL, SW_APPLY (1 = do it; default dry run, prints the plan).
"""
import os
import re

import psycopg

TABLES = ("baseline_history", "final_hp", "final_hp_derived", "board_scored", "ladder_calibration_asof", "final_hp_board_cal", "confidence_model",
          "availability_delta")


def main():
    apply = os.environ.get("SW_APPLY") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    reg = lambda n: conn.execute("SELECT to_regclass(%s)", (n,)).fetchone()[0]  # noqa: E731
    plan_idx, missing = [], []
    for t in TABLES:
        if reg(f"nba_score.{t}_v2") is None:
            missing.append(t); continue
        have = {r[0] for r in conn.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='nba_score' AND tablename=%s", (t + "_v2",))}
        have_norm = {re.sub(r"INDEX \S+ ON", "INDEX x ON", h).replace(f"nba_score.{t}_v2", f"nba_score.{t}") for h in have}
        for name, ddl in conn.execute("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='nba_score' AND tablename=%s", (t,)):
            if re.sub(r"INDEX \S+ ON", "INDEX x ON", ddl) in have_norm:
                continue
            new = ddl.replace(f"INDEX {name} ON", f"INDEX {name}_v2x ON").replace(f"nba_score.{t} ", f"nba_score.{t}_v2 ")
            plan_idx.append(new)
    print(f"SW|missing _v2 tables: {missing or 'none'}", flush=True)
    for t in TABLES:
        if t in missing:
            continue
        a = conn.execute(f"SELECT count(*), count(DISTINCT game_date) FROM nba_score.{t}" if t not in ("final_hp_board_cal", "confidence_model", "ladder_calibration_asof")
                         else f"SELECT count(*), NULL FROM nba_score.{t}").fetchone()
        b = conn.execute(f"SELECT count(*), count(DISTINCT game_date) FROM nba_score.{t}_v2" if t not in ("final_hp_board_cal", "confidence_model", "ladder_calibration_asof")
                         else f"SELECT count(*), NULL FROM nba_score.{t}_v2").fetchone()
        print(f"SW|{t:24s} production rows {a[0]:>11,} dates {a[1]} | v2 rows {b[0]:>11,} dates {b[1]}", flush=True)
    gap = conn.execute("""SELECT count(*) FROM (SELECT DISTINCT game_date FROM nba_score.baseline_history) p
                          WHERE NOT EXISTS (SELECT 1 FROM nba_score.baseline_history_v2 v WHERE v.game_date = p.game_date)""").fetchone()[0]
    print(f"SW|production slate dates missing from baseline_history_v2: {gap}", flush=True)
    print(f"SW|indexes to create on _v2 tables: {len(plan_idx)}", flush=True)
    for q in plan_idx:
        print("SW|   " + q, flush=True)
    if not apply:
        print("SW|DRY RUN - nothing changed", flush=True)
        return
    if missing or gap:
        raise SystemExit("SW|REFUSED: preflight not clean")
    for q in plan_idx:
        conn.execute(q); conn.commit()
    from build_whole_number_hp import VIEW
    with conn.transaction():
        conn.execute("DROP VIEW IF EXISTS nba_score.final_hp_all")
        for t in TABLES:
            conn.execute(f"ALTER TABLE nba_score.{t} RENAME TO {t}_pre_v2")
            conn.execute(f"ALTER TABLE nba_score.{t}_v2 RENAME TO {t}")
            for (iname,) in conn.execute("SELECT indexname FROM pg_indexes WHERE schemaname='nba_score' AND tablename=%s", (t + "_pre_v2",)).fetchall():
                conn.execute(f"ALTER INDEX nba_score.{iname} RENAME TO {iname[:50]}_prev2")
            for (iname,) in conn.execute("SELECT indexname FROM pg_indexes WHERE schemaname='nba_score' AND tablename=%s", (t,)).fetchall():
                base = iname.replace("_v2x", "").replace("final_hp_v2_", "final_hp_").replace("availability_delta_v2_", "availability_delta_")
                if base != iname and conn.execute("SELECT to_regclass(%s)", ("nba_score." + base,)).fetchone()[0] is None:
                    conn.execute(f"ALTER INDEX nba_score.{iname} RENAME TO {base}")
        conn.execute(VIEW)
    print("SW|SWITCHED: production tables are now the one-formula store; the previous ones are kept as <name>_pre_v2", flush=True)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
