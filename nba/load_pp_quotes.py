#!/usr/bin/env python3
"""
Load EVERY PrizePicks quote - all sections (VALIDATE, BASE, FLEX, ALTALT, SAMEGAME, UNDER, LEG, DRIFT), both leagues -
into nba_market.pp_quote, so slip-level rules can be tested in SQL instead of by reading JSON.

Per-leg prices stay in pp_mined_leg / pp_mined_leg_wnba (load_pp_mined_legs.py); this table keeps the research sections
too: all-standard bases and Flex tables, Flex compositions, alt x alt multiplicativity, same-game pairs, the Less side.
League comes from each file's own meta (7 NBA, 3 WNBA). Self-healing: loads every file not yet in the table.
Env: DATABASE_URL.
"""
import glob
import json
import os
import sys

DIRS = ("nba/data/pp_payouts", "nba/data/pp_payouts_wnba")
DDL = """CREATE TABLE IF NOT EXISTS nba_market.pp_quote (
    run_file text NOT NULL, seq int NOT NULL, league int, quoted_at text, section text, n int, n_games int,
    note text, status int, target text, power jsonb, flex jsonb, power_srp jsonb, flex_srp jsonb,
    power_adj boolean, flex_adj boolean, legs jsonb, error text, loaded_at timestamptz DEFAULT now(),
    PRIMARY KEY (run_file, seq))"""


def quotes_from_file(path):
    """(run_file, seq, league, ...) rows from one mapper JSON - pure function"""
    d = json.load(open(path, encoding="utf-8"))
    name, league = os.path.basename(path), (d.get("meta") or {}).get("league")
    rows = []
    for i, q in enumerate(d.get("quotes") or []):
        rows.append((name, i, league, q.get("t"), q.get("section"), q.get("n"), q.get("n_games"), q.get("note"),
                     q.get("status"), q.get("target"),
                     json.dumps(q.get("power")) if q.get("power") is not None else None,
                     json.dumps(q.get("flex")) if q.get("flex") is not None else None,
                     json.dumps(q.get("power_srp")) if q.get("power_srp") is not None else None,
                     json.dumps(q.get("flex_srp")) if q.get("flex_srp") is not None else None,
                     q.get("power_adj"), q.get("flex_adj"), json.dumps(q.get("legs") or []), q.get("error")))
    return name, rows


def main():
    import psycopg
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    with conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute("SELECT DISTINCT run_file FROM nba_market.pp_quote")
        loaded = {r[0] for r in cur.fetchall()}
    conn.commit()
    files = sorted(p for d in DIRS for p in glob.glob(os.path.join(d, "pp_payout_map_*.json")))
    total = 0
    for path in files:
        if os.path.basename(path) in loaded:
            continue
        name, rows = quotes_from_file(path)
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO nba_market.pp_quote
                (run_file, seq, league, quoted_at, section, n, n_games, note, status, target, power, flex, power_srp,
                 flex_srp, power_adj, flex_adj, legs, error)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s,%s::jsonb,%s)
                ON CONFLICT DO NOTHING""", rows)
        conn.commit()
        print(f"QUOTES_LOADED|{name}|{len(rows)}", flush=True)
        total += len(rows)
    print(f"QUOTES_DONE|files={len(files)}|previously_loaded={len(loaded)}|new_rows={total}", flush=True)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
