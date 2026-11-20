#!/usr/bin/env python3
"""
FORWARD TRACKER OF THE ONE CANDIDATE (NBA_HONEST_REBUILD.md 8s / 8u). Writes ONLY nba_score.honest_top_list (beside production; nothing reads it).
The candidate: the top regular single-stat Unders of the slate by the walk-forward blend, one leg a player, one a game. Every morning, after grading and
after the leg model has scored the new slate out of sample, this records what the candidate's slips would have paid:
  underdog    2-pick Standard from the top 2 (3.5x)                      prizepicks  4-pick Flex from the top 4 (6x / 1.5x) and 3-pick Power from the top 3 (6x)
One row per app x date x structure: the legs (player, prop, line), hits, payout. Prints the season to date and the last 14 slates with drawdown and drought.
It is a scoreboard, not a strategy switch (owner D8: live strategies are not touched).
Env: DATABASE_URL.
"""
import json
import os

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
PLAN = {"underdog": [("2-pick Standard", 2, {2: 3.5})], "prizepicks": [("4-pick Flex", 4, {4: 6.0, 3: 1.5}), ("3-pick Power", 3, {3: 6.0})]}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.line, v.hit::int hit, v.p_blend::float8 p, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.is_under AND v.p_blend IS NOT NULL AND v.prop <> ALL(%s)""", conn, params=(list(COMBO),))
    names = dict(conn.execute("SELECT player_id::text, max(norm_name) FROM nba_ref.player_name_map GROUP BY 1").fetchall())
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    rows = []
    for (app, gd), g in d.groupby(["app", "gd"]):
        g = g.sort_values("p", ascending=False).drop_duplicates("player_id")
        for nm, k, table in PLAN[app]:
            pick = []; games = set()
            for r in g.itertuples(index=False):
                if r.game_id in games:
                    continue
                pick.append(r); games.add(r.game_id)
                if len(pick) == k:
                    break
            if len(pick) < k:
                continue
            h = sum(r.hit for r in pick); pay = table.get(h, 0.0)
            rows.append((app, pick[0].season, gd, nm, k, h, pay, json.dumps([{"player": names.get(r.player_id, r.player_id), "prop": r.prop, "line": r.line, "blend": round(r.p, 3), "hit": int(r.hit)} for r in pick])))
    conn.execute("""CREATE TABLE IF NOT EXISTS nba_score.honest_top_list (app text, season text, game_date date, structure text, picks int, hits int, payout float8, legs jsonb,
                    built_at timestamptz DEFAULT now(), PRIMARY KEY (app, game_date, structure))""")
    conn.execute("DELETE FROM nba_score.honest_top_list")
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO nba_score.honest_top_list (app, season, game_date, structure, picks, hits, payout, legs) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)", rows)
    conn.commit(); conn.close()
    t = pd.DataFrame(rows, columns=["app", "season", "gd", "st", "k", "h", "pay", "legs"])
    print(f"TT|candidate slips recorded: {len(t):,} (table nba_score.honest_top_list); last slate {t['gd'].max()}", flush=True)
    for (app, st), g in t.groupby(["app", "st"]):
        for label, x in [(s, g[g["season"] == s]) for s in sorted(g["season"].unique())] + [("last 14 slates", g.sort_values("gd").tail(14))]:
            if not len(x):
                continue
            x = x.sort_values("gd"); p = x["pay"].values - 1; cum = np.concatenate([[0], np.cumsum(p)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = cur_ = 0
            for w in (x["pay"].values > 1):
                cur_ = 0 if w else cur_ + 1; dr = max(dr, cur_)
            print(f"TT|  {app:10s} {st:16s} {label:15s}: slips {len(x):4d} | leg hit {x['h'].sum() / x['k'].sum():.3f} | ROI {100 * p.mean():+6.1f}% | units {p.sum():+6.1f} | drawdown {dd:4.1f} | drought {dr}", flush=True)
    print("TT|DONE", flush=True)


if __name__ == "__main__":
    main()
