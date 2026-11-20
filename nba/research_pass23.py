#!/usr/bin/env python3
"""
PASS 23 - THE ONE-LEG-A-GAME RULE. READ-ONLY. (NBA_HONEST_REBUILD.md 8aj)
Every live slip takes one leg a player AND one leg a game. The stack test (S6a) found same-game Unders neither help nor hurt each other (lift 1.00x at 2-3 picks),
so the game rule may only be pushing slips down the ranking. Here: legs a game allowed = 1 (live) | 2 | 3 | no limit; and legs a TEAM = 1 with no game limit.
Rankers: blend, model, average. Pools: every single stat, no assists, rebounds, lines under 10. Every structure. Also the hit rate of the legs used and how often a slip
really holds two legs of one game.  Line format: structure pooled-return%(seasons positive of 3).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18
import research_pass19 as P19

SEAS = R.SEAS


def take(pl, gm, tm, k, gcap, tcap):
    out = []; games = {}; teams = {}; players = set()
    for i in range(len(pl)):
        if pl[i] in players or games.get(gm[i], 0) >= gcap or teams.get(tm[i], 0) >= tcap:
            continue
        out.append(i); players.add(pl[i]); games[gm[i]] = games.get(gm[i], 0) + 1; teams[tm[i]] = teams.get(tm[i], 0) + 1
        if len(out) == k:
            return out
    return None


def main():
    d = P18.load(); d["avg"] = (d["blend"] + d["ph"]) / 2
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    t = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, split_part(matchup, ' ', 1) tri FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'", conn).drop_duplicates(["player_id", "gd"])
    conn.close()
    d = d.merge(t, on=["player_id", "gd"], how="left"); d["tri"] = d["tri"].fillna("t" + d["player_id"])
    RULES = (("1 a game (live)", 1, 9), ("2 a game", 2, 9), ("3 a game", 3, 9), ("no game limit", 9, 9), ("1 a team, no game limit", 9, 1), ("2 a game, 1 a team", 2, 1))
    pools = {"every single stat": lambda x: np.ones(len(x), bool), "no assists": lambda x: (x["prop"] != "assists").values, "rebounds": lambda x: (x["prop"] == "rebounds").values,
             "lines under 10": lambda x: (x["line"] < 10).values, "lines under 10, no assists": lambda x: ((x["line"] < 10) & (x["prop"] != "assists")).values}
    for app, TAB in (("underdog", R.UD), ("prizepicks", R.PP)):
        a = d[d["app"] == app]
        print(f"\nP23|================ {app.upper()} ================", flush=True)
        for rn, col in (("blend", "blend"), ("model", "ph"), ("average", "avg")):
            for pn, pf in pools.items():
                x = a[pf(a)]
                days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
                print(f"P23|-- {rn} | {pn}", flush=True)
                for rl, gcap, tcap in RULES:
                    acc = {key: [] for key in TAB}; legs = []; same = 0; n6 = 0
                    for gd, g in days:
                        pl = g["player_id"].values; gm = g["game_id"].values; tm = g["tri"].values; hit = g["hit"].values; s = g["season"].iloc[0]
                        for (st, k), table in TAB.items():
                            ix = take(pl, gm, tm, k, gcap, tcap)
                            if ix is not None:
                                acc[(st, k)].append((s, table.get(int(hit[ix].sum()), 0.0) - 1))
                                if (st, k) == ("P", 5):
                                    legs.extend(hit[ix]); n6 += 1; same += len({gm[i] for i in ix}) < 5
                    res = {key: pd.DataFrame(rows, columns=["s", "u"]) for key, rows in acc.items()}
                    print(f"P23|   {rl:24s}: {P19.line(res, app)} | legs of the 5-pick hit {100 * np.mean(legs) if legs else float('nan'):.1f}% | 5-picks holding two legs of a game {100 * same / max(1, n6):.0f}%", flush=True)
    print("P23|DONE", flush=True)


if __name__ == "__main__":
    main()
