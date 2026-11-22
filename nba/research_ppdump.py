#!/usr/bin/env python3
"""DUMP PP QUOTES TO THE RUN LOG FOR OFFLINE ANALYSIS. READ-ONLY. Env: DATABASE_URL, PPD_SINCE, PPD_SECTIONS (LAD,CMB,LEG,LESS), PPD_BOARD (1 = also the
board rows of those runs). One line per quote: Q|run_file|seq|quoted_at|section|n|note|power json|flex json|legs json (compact)."""
import json
import os

import psycopg


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPD_SINCE", "2026-11-19")
    secs = (os.environ.get("PPD_SECTIONS") or "LAD,CMB,LEG,LESS").split(",")
    n = 0
    cur = conn.cursor(name="d")
    cur.execute("""SELECT run_file, seq, quoted_at, section, n, note, power, flex, legs FROM nba_market.pp_quote
                   WHERE status = 200 AND quoted_at >= %s AND section = ANY(%s) ORDER BY run_file, seq""", (since, secs))
    for rf, seq, qa, sec, k, note, pw, fx, legs in cur:
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        lg = [[l.get("id"), l.get("name"), l.get("stat"), l.get("line"), l.get("odds"), l.get("side"), l.get("game")] for l in legs]
        print("Q|" + "|".join([rf, str(seq), str(qa), sec, str(k), (note or "").replace("|", "~"), json.dumps(pw, separators=(",", ":")),
                               json.dumps(fx, separators=(",", ":")), json.dumps(lg, separators=(",", ":"))]))
        n += 1
    print(f"PPD|quotes {n}", flush=True)
    if os.environ.get("PPD_BOARD") == "1":
        c2 = conn.cursor(name="b")
        c2.execute("""SELECT b.run_file, b.projection_id, b.player_id, b.player, b.team, b.stat, b.line, b.odds, b.game, b.start_time FROM nba_market.pp_board_row b
                      WHERE b.run_file IN (SELECT DISTINCT run_file FROM nba_market.pp_quote WHERE quoted_at >= %s AND section = ANY(%s))""", (since, secs))
        m = 0
        for r in c2:
            print("B|" + "|".join(str(x) for x in r)); m += 1
        print(f"PPD|board rows {m}", flush=True)


def books():
    if not os.environ.get("PPD_BOOKDATE"):
        return
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    c = conn.cursor(name="k")
    c.execute("""SELECT snapshot_label, snapshot_ts, bookmaker, market_key, player, side, line, price, event_id FROM nba_market.board_snapshots
                 WHERE game_date = %s AND snapshot_label LIKE ANY(%s)""", (os.environ["PPD_BOOKDATE"], (os.environ.get("PPD_BOOKLABELS") or "align").split(",")))
    m = 0
    for r in c:
        print("K|" + "|".join(str(x) for x in r)); m += 1
    print(f"PPD|book rows {m}", flush=True)


if __name__ == "__main__":
    books()
    main()
