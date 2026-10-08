#!/usr/bin/env python3
"""
POSTSEASON LOADER (strategy §31w P-1, 2026-10-08).

DESIGN DECISION - SEPARATE TABLES, NOT THE REGULAR-SEASON ONES. The sweep of every game-log consumer found that loading play-in
/ playoff rows into nba_stats.player_game_log / nba_team.team_game_log would silently change certified regular-season numbers:
the pf20 foul view (rolling 20 games), the daily-delta DvP and completeness checks, the live engine's season block (s1 would
move to June -> final-7 and week rules shift), research backsims and prop_universe phases. So the postseason lives in twins:

  nba_stats.player_game_log_postseason          (LIKE nba_stats.player_game_log INCLUDING ALL)
  nba_team.team_game_log_postseason             (LIKE nba_team.team_game_log)
  nba_stats.player_game_log_advanced_postseason / nba_team.team_game_log_advanced_postseason
  nba_stats.player_game_log_usage_postseason / _scoring_postseason, nba_team.team_game_log_scoring_postseason / _four_factors_postseason
  nba_stats.player_game_starter_status_postseason, nba_stats.game_officials_postseason

Same columns, same keys, same value mapping as the Cloudflare loaders (player_id 'nba_<id>', team_id 'nba_<id>', season label
from the file, source_key). Postseason-aware consumers UNION the twin explicitly; nothing regular-season reads it.
Idempotent upserts. Env: DATABASE_URL, POST_SEASONS (default 2023-24,2024-25,2025-26).
"""
import json
import os
from pathlib import Path

import psycopg

DATA = Path("nba/data")
TWINS = [("nba_stats", "player_game_log"), ("nba_team", "team_game_log"), ("nba_stats", "player_game_log_advanced"),
         ("nba_team", "team_game_log_advanced"), ("nba_stats", "player_game_log_usage"), ("nba_stats", "player_game_log_scoring"),
         ("nba_team", "team_game_log_scoring"), ("nba_team", "team_game_log_four_factors"), ("nba_stats", "player_game_starter_status"),
         ("nba_stats", "game_officials")]


def cols_of(conn, schema, table):
    return [r[0] for r in conn.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position",
                                       (schema, table)).fetchall()]


def pkey(conn, schema, table):
    return [r[0] for r in conn.execute("""SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum = ANY(i.indkey)
                                          WHERE i.indrelid = %s::regclass AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)""",
                                       (f"{schema}.{table}",)).fetchall()]


def upsert(conn, schema, table, rows):
    if not rows:
        return 0
    cols = [c for c in cols_of(conn, schema, f"{table}_postseason") if c not in ("updated_at", "created_at") and c in rows[0]]
    pk = pkey(conn, schema, f"{table}_postseason")
    upd = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c not in pk) or f"{pk[0]}=EXCLUDED.{pk[0]}"
    sql = (f"INSERT INTO {schema}.{table}_postseason ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
           f"ON CONFLICT ({', '.join(pk)}) DO UPDATE SET {upd}")
    with conn.cursor() as cur:
        cur.executemany(sql, [tuple(r.get(c) for c in cols) for r in rows])
    return len(rows)


def recs(path):
    if not path.exists():
        return []
    d = json.loads(path.read_text())
    return d.get("records") or d.get("rows") or []


def lower(r):
    return {k.lower(): v for k, v in r.items()}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    for schema, table in TWINS:
        conn.execute(f"CREATE TABLE IF NOT EXISTS {schema}.{table}_postseason (LIKE {schema}.{table} INCLUDING ALL)")
    seasons = [s.strip() for s in os.environ.get("POST_SEASONS", "2023-24,2024-25,2025-26").split(",") if s.strip()]
    for season in seasons:
        slug = season.replace("-", "_")
        src = f"postseason_{slug}"
        n = {}
        rows = []
        for r in recs(DATA / f"nba_player_game_log_postseason_{slug}.json"):
            x = lower(r)
            x.update(player_id=f"nba_{r['PLAYER_ID']}", nba_player_id=r["PLAYER_ID"], team_id=f"nba_{r['TEAM_ID']}" if r.get("TEAM_ID") else None,
                     season=season, game_date=r["GAME_DATE"][:10], source_key=src)
            rows.append(x)
        n["player_game_log"] = upsert(conn, "nba_stats", "player_game_log", rows)
        rows = []
        for r in recs(DATA / f"nba_team_game_log_postseason_{slug}.json"):
            x = lower(r)
            x.update(team_id=f"nba_{r['TEAM_ID']}", nba_team_id=r["TEAM_ID"], season=season, game_date=r["GAME_DATE"][:10], source_key=src)
            rows.append(x)
        n["team_game_log"] = upsert(conn, "nba_team", "team_game_log", rows)
        for name, schema, table, ent in (("nba_player_game_log_advanced", "nba_stats", "player_game_log_advanced", "player"),
                                          ("nba_team_game_log_advanced", "nba_team", "team_game_log_advanced", "team")):
            rows = []
            for r in recs(DATA / f"{name}_postseason_{slug}.json"):
                x = lower(r)
                x[f"{ent}_id"] = f"nba_{r[ent.upper() + '_ID']}"
                x["source_key"] = src
                rows.append(x)
            n[table] = upsert(conn, schema, table, rows)
        for key, schema, table, ent in (("player_usage", "nba_stats", "player_game_log_usage", "player"),
                                         ("player_scoring", "nba_stats", "player_game_log_scoring", "player"),
                                         ("team_scoring", "nba_team", "team_game_log_scoring", "team"),
                                         ("team_four_factors", "nba_team", "team_game_log_four_factors", "team")):
            rows = []
            for r in recs(DATA / f"nba_backfill_{key}_postseason_{slug}.json"):
                x = lower(r)
                x[f"{ent}_id"] = f"nba_{r[ent.upper() + '_ID']}"
                x["source_key"] = src
                rows.append(x)
            n[table] = upsert(conn, schema, table, rows)
        rows = [{"player_id": f"nba_{r['player_id']}", "game_id": r["game_id"], "start_position": r.get("start_position"),
                 "is_starter": r.get("is_starter"), "comment": r.get("comment"), "source_key": src}
                for r in recs(DATA / f"nba_starter_status_postseason_{slug}.json")]
        n["player_game_starter_status"] = upsert(conn, "nba_stats", "player_game_starter_status", rows)
        rows = [{"game_id": r["game_id"], "official_id": f"nba_{r['official_id']}", "nba_official_id": r["official_id"], "full_name": r.get("full_name"),
                 "jersey_num": r.get("jersey_num"), "assignment": r.get("assignment"), "source_key": src}
                for r in recs(DATA / f"nba_game_officials_postseason_{slug}.json") if r.get("official_id")]
        n["game_officials"] = upsert(conn, "nba_stats", "game_officials", rows)
        print(f"{season}: " + ", ".join(f"{k} {v}" for k, v in n.items()), flush=True)


if __name__ == "__main__":
    main()
