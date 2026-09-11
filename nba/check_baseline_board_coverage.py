#!/usr/bin/env python3
"""
1) Load the NBA player id -> normalized name map into Postgres (nba_ref.player_name_map).
   The engine, the grader and every board join need the same mapping; keeping it in the DB means
   the joins can happen in SQL instead of shipping 5k names into every script.

2) Coverage check: for a given slate, does the baseline ladder cover the lines the BOARD offered,
   PER PLAYER? The ladder is anchored per player, so a prop-level min/max comparison is misleading -
   the union of all players' lines says nothing about whether a specific player's rungs reach his own
   board lines. Reports, per prop:
       matched              - board leg has a baseline row at that exact (player, prop, line)
       player_missing       - the player has no baseline rows at all for that prop
       line_out_of_range    - player is in the ladder but the line sits outside his rungs
       line_gap             - line is inside his range but that exact rung is absent

Env: DATABASE_URL, COVER_DATE=YYYY-MM-DD (default 2026-03-15), COVER_BOOK=prizepicks
"""
import json
import os
import re
import unicodedata
import urllib.request

import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"

# board market_key (alternate stripped) -> baseline prop name
MARKET_TO_PROP = {
    "player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists",
    "player_threes": "threes_made", "player_blocks": "blocks", "player_steals": "steals",
    "player_turnovers": "turnovers",
    # combos live in the combos ladder, not the singles ladder - reported separately
    "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb",
    "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast", "player_blocks_steals": "stocks",
    "player_double_double": "double_double",
}


def norm_name(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with urllib.request.urlopen(urllib.request.Request(RAW + "nba_all_players.json", headers={"User-Agent": "alphadog"}), timeout=120) as r:
        doc = json.load(r)
    rows = [(str(x["PERSON_ID"]), norm_name(x.get("DISPLAY_FIRST_LAST")), x.get("DISPLAY_FIRST_LAST"))
            for x in doc.get("records") or [] if x.get("PERSON_ID") and norm_name(x.get("DISPLAY_FIRST_LAST"))]
    with conn.cursor() as cur:
        cur.execute("""CREATE SCHEMA IF NOT EXISTS nba_ref;
                       DROP TABLE IF EXISTS nba_ref.player_name_map;
                       CREATE TABLE nba_ref.player_name_map (player_id text primary key, norm_name text, display_name text)""")
        cur.executemany("INSERT INTO nba_ref.player_name_map VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", rows)
        cur.execute("CREATE INDEX player_name_map_norm ON nba_ref.player_name_map (norm_name)")
        cur.execute("SELECT count(*) FROM nba_ref.player_name_map")
        print("player_name_map rows:", cur.fetchone()[0], flush=True)

    d = os.environ.get("COVER_DATE", "2026-03-15")
    book = os.environ.get("COVER_BOOK", "prizepicks")
    mapping = "(VALUES " + ",".join(f"('{k}','{v}')" for k, v in MARKET_TO_PROP.items()) + ") AS m(market_key, prop)"
    sql = f"""
    WITH board AS (
      SELECT DISTINCT regexp_replace(lower(s.player),'[^a-z]','','g') AS nm, s.player,
             replace(s.market_key,'_alternate','') AS market_key, s.line
      FROM nba_market.board_snapshots s
      WHERE s.game_date = %(d)s AND s.bookmaker = %(b)s AND s.snapshot_label='window' AND s.line IS NOT NULL
    ), b AS (
      SELECT board.*, m.prop, p.player_id
      FROM board JOIN {mapping} ON m.market_key = board.market_key
      LEFT JOIN nba_ref.player_name_map p ON p.norm_name = board.nm
    ), lad AS (
      SELECT player_id, prop, line, min(line) OVER (PARTITION BY player_id, prop) AS lo,
             max(line) OVER (PARTITION BY player_id, prop) AS hi
      FROM nba_score.baseline_ladder WHERE asof = %(d)s
    ), rng AS (
      SELECT player_id, prop, min(line) AS lo, max(line) AS hi, count(*) AS rungs
      FROM nba_score.baseline_ladder WHERE asof = %(d)s GROUP BY 1,2
    )
    SELECT b.prop,
           count(*) AS board_legs,
           count(*) FILTER (WHERE b.player_id IS NULL) AS name_unresolved,
           count(*) FILTER (WHERE b.player_id IS NOT NULL AND r.player_id IS NULL) AS player_missing,
           count(*) FILTER (WHERE r.player_id IS NOT NULL AND (b.line < r.lo OR b.line > r.hi)) AS line_out_of_range,
           count(*) FILTER (WHERE r.player_id IS NOT NULL AND b.line BETWEEN r.lo AND r.hi
                            AND NOT EXISTS (SELECT 1 FROM nba_score.baseline_ladder l
                                            WHERE l.asof=%(d)s AND l.player_id=b.player_id AND l.prop=b.prop AND l.line=b.line)) AS line_gap,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM nba_score.baseline_ladder l
                                          WHERE l.asof=%(d)s AND l.player_id=b.player_id AND l.prop=b.prop AND l.line=b.line)) AS matched
    FROM b LEFT JOIN rng r ON r.player_id=b.player_id AND r.prop=b.prop
    GROUP BY 1 ORDER BY 2 DESC;
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"d": d, "b": book})
        print(f"\nCOVERAGE {book} {d}")
        print(f"{'prop':<16}{'legs':>7}{'unresolved':>12}{'no_player':>11}{'out_of_range':>14}{'line_gap':>10}{'matched':>9}")
        for r in cur.fetchall():
            print(f"{str(r[0]):<16}{r[1]:>7}{r[2]:>12}{r[3]:>11}{r[4]:>14}{r[5]:>10}{r[6]:>9}")
    conn.close()


if __name__ == "__main__":
    main()
