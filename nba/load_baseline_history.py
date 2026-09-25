#!/usr/bin/env python3
"""
Load a day-by-day baseline history artifact (from build_baseline_history.py) into Postgres.

Table nba_score.baseline_history mirrors baseline_ladder but is keyed by GAME_DATE, so the engine can ask
"what baseline probability would this leg have had on that day" for any day of either season.

Size note: a full season of one prop pair is ~500k rows - far too large to commit to the repo - so the
workflow builds -> loads -> deletes the JSON. Transactional: nothing is deleted unless the insert succeeds.

Env: DATABASE_URL, HISTORY_FILE
"""
import json
import os
import sys

import psycopg


def main():
    path = os.environ["HISTORY_FILE"]
    doc = json.load(open(path))
    meta, rows = doc.get("meta") or {}, doc.get("rows") or []
    if not rows:
        raise SystemExit(f"ABORT: {path} has no rows")
    season, props = meta.get("season"), meta.get("props")
    print(f"loading {path}: season={season} props={props} rows={len(rows)} dates={meta.get('dates')} players={meta.get('players')}", flush=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        # LOCK FIRST, BEFORE ANY DDL. A previous version took this advisory lock AFTER the
        # CREATE TABLE / CREATE INDEX IF NOT EXISTS statements - but those already take table locks, so
        # one process held table locks and waited for the advisory lock while another held the advisory
        # lock and waited for the table locks. That INVERTED the lock order and produced a second
        # deadlock:  "Process A waits for RowExclusiveLock ... Process B waits for ExclusiveLock on
        # advisory lock". Every concurrent loader must acquire the SAME lock FIRST and in the SAME order.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext('nba_score.baseline_history'))")
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.baseline_history (
            season text, game_date date, player_id text, game_id text, prop text, period text,
            line numeric, anchor numeric, ladder_offset int, p_more numeric, p_less numeric, p_raw numeric,
            role_tier text, var_band text, used_emp boolean, ladder_steps int, recipe text,
            proj_min numeric, rate36 numeric,
            loaded_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS baseline_history_uidx ON nba_score.baseline_history
            (game_date, player_id, game_id, prop, period, line)""")
        # 💾 REDUNDANT INDEX REMOVED (2026-09-24, disk hygiene). This used to create
        # `baseline_history_lookup (game_date, player_id, prop)` - 415 MB - which is a strict PREFIX of
        # `baseline_history_lookup_idx (game_date, player_id, prop, line) INCLUDE (proj_min, rate36,
        # used_emp, role_tier)`, built by build_confidence_v3.py and used 29.6M times. Postgres serves
        # every query the narrow one could serve from the wider one, so the 415 MB bought nothing.
        # Recreating it here would silently undo the reclaim on the next backfill, so the statement is
        # gone rather than commented out. The two indexes that matter are created above and by the
        # confidence refit: baseline_history_uidx (uniqueness, 54.5M scans) and the wide lookup.
        prop_set = sorted({r["prop"] for r in rows})
        cur.execute("DELETE FROM nba_score.baseline_history WHERE season = %s AND prop = ANY(%s)", (season, prop_set))
        # BULK LOAD (2026-09-25). The previous executemany inserted a season of one prop pair (~700k
        # rows) one row at a time through the unique index: measured ~1 hour per pair, with every other
        # loader waiting on the advisory lock behind it. COPY into a temp staging table, then one
        # set-based INSERT with the same ON CONFLICT clause - identical rows, identical semantics, same
        # single transaction (the DELETE above and this INSERT still commit or roll back together).
        cur.execute("""CREATE TEMP TABLE _bh_stage (
            season text, game_date date, player_id text, game_id text, prop text, period text,
            line numeric, anchor numeric, ladder_offset int, p_more numeric, p_less numeric, p_raw numeric,
            role_tier text, var_band text, used_emp boolean, ladder_steps int, recipe text,
            proj_min numeric, rate36 numeric) ON COMMIT DROP""")
        with cur.copy("""COPY _bh_stage (season, game_date, player_id, game_id, prop, period, line, anchor, ladder_offset,
                         p_more, p_less, p_raw, role_tier, var_band, used_emp, ladder_steps, recipe, proj_min, rate36)
                         FROM STDIN""") as cp:
            for r in rows:
                cp.write_row((season, r["game_date"], r["player_id"], r["game_id"], r["prop"], r.get("period") or "FULL",
                              r["line"], r.get("anchor"), r.get("offset"), r.get("p_more"), r.get("p_less"), r.get("p_raw"),
                              r.get("role_tier"), r.get("var_band"), r.get("used_emp"), meta.get("ladder_steps"),
                              (meta.get("recipe") or "")[:120], r.get("proj_min"), r.get("rate36")))
        cur.execute("""INSERT INTO nba_score.baseline_history
            (season, game_date, player_id, game_id, prop, period, line, anchor, ladder_offset, p_more, p_less, p_raw,
             role_tier, var_band, used_emp, ladder_steps, recipe, proj_min, rate36)
            SELECT DISTINCT ON (game_date, player_id, game_id, prop, period, line)
                   season, game_date, player_id, game_id, prop, period, line, anchor, ladder_offset, p_more, p_less, p_raw,
                   role_tier, var_band, used_emp, ladder_steps, recipe, proj_min, rate36
            FROM _bh_stage s
            WHERE %s = 'full'
               OR NOT EXISTS (SELECT 1 FROM _bh_scope sc WHERE sc.game_date = s.game_date AND sc.prop = s.prop AND sc.period = s.period)
               OR EXISTS (SELECT 1 FROM _bh_keys k WHERE k.game_date = s.game_date AND k.player_id = s.player_id
                            AND k.prop = s.prop AND k.period = s.period AND k.line = s.line)
            ON CONFLICT (game_date, player_id, game_id, prop, period, line) DO UPDATE SET
              p_more=EXCLUDED.p_more, p_less=EXCLUDED.p_less, p_raw=EXCLUDED.p_raw, anchor=EXCLUDED.anchor,
              ladder_offset=EXCLUDED.ladder_offset, role_tier=EXCLUDED.role_tier, var_band=EXCLUDED.var_band,
              used_emp=EXCLUDED.used_emp, proj_min=EXCLUDED.proj_min, rate36=EXCLUDED.rate36, loaded_at=now()""",
            (scope_mode,))
        cur.execute("SELECT count(*) FROM _bh_stage")
        n_stage = cur.fetchone()[0]
        print(f"  staged {n_stage:,} rows, scope={scope_mode}", flush=True)
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT prop, count(*), count(DISTINCT game_date), count(DISTINCT player_id) FROM nba_score.baseline_history WHERE season=%s GROUP BY 1 ORDER BY 1", (season,))
        for p, n, d, pl in cur.fetchall():
            print(f"  {season} {p:<16} rows={n:>8} dates={d:>4} players={pl}", flush=True)
    conn.close()
    print("DONE")


if __name__ == "__main__":
    main()
