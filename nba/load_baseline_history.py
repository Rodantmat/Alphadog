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
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.baseline_history (
            season text, game_date date, player_id text, game_id text, prop text, period text,
            line numeric, anchor numeric, ladder_offset int, p_more numeric, p_less numeric, p_raw numeric,
            role_tier text, var_band text, used_emp boolean, ladder_steps int, recipe text,
            loaded_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS baseline_history_uidx ON nba_score.baseline_history
            (game_date, player_id, game_id, prop, period, line)""")
        cur.execute("CREATE INDEX IF NOT EXISTS baseline_history_lookup ON nba_score.baseline_history (game_date, player_id, prop)")
        prop_set = sorted({r["prop"] for r in rows})
        cur.execute("DELETE FROM nba_score.baseline_history WHERE season = %s AND prop = ANY(%s)", (season, prop_set))
        cur.executemany("""INSERT INTO nba_score.baseline_history
            (season, game_date, player_id, game_id, prop, period, line, anchor, ladder_offset, p_more, p_less, p_raw,
             role_tier, var_band, used_emp, ladder_steps, recipe)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (game_date, player_id, game_id, prop, period, line) DO UPDATE SET
              p_more=EXCLUDED.p_more, p_less=EXCLUDED.p_less, p_raw=EXCLUDED.p_raw, anchor=EXCLUDED.anchor,
              ladder_offset=EXCLUDED.ladder_offset, role_tier=EXCLUDED.role_tier, var_band=EXCLUDED.var_band,
              used_emp=EXCLUDED.used_emp, loaded_at=now()""",
            [(season, r["game_date"], r["player_id"], r["game_id"], r["prop"], r.get("period") or "FULL",
              r["line"], r.get("anchor"), r.get("offset"), r.get("p_more"), r.get("p_less"), r.get("p_raw"),
              r.get("role_tier"), r.get("var_band"), r.get("used_emp"), meta.get("ladder_steps"), (meta.get("recipe") or "")[:120])
             for r in rows])
    conn.commit()
    with conn.cursor() as cur:
        cur.execute("SELECT prop, count(*), count(DISTINCT game_date), count(DISTINCT player_id) FROM nba_score.baseline_history WHERE season=%s GROUP BY 1 ORDER BY 1", (season,))
        for p, n, d, pl in cur.fetchall():
            print(f"  {season} {p:<16} rows={n:>8} dates={d:>4} players={pl}", flush=True)
    conn.close()
    print("DONE")


if __name__ == "__main__":
    main()
