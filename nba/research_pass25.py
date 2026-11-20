#!/usr/bin/env python3
"""
PASS 25 - UNDERDOG, TWO LEGS A GAME: WHAT ELSE BESIDE U8? READ-ONLY. (NBA_HONEST_REBUILD.md 8al)
U8 = 4-pick Flex, blend, no assists, up to two a game. Here every other 3- / 4- / 5-pick slip built the same way: rankers blend / model / average; pools every stat, no assists,
points, rebounds, no points, home, away, starters-free (lines under 10), lines 10+, each prop different; structures 3S 3F 4F 5F; one a game against two a game.
For each: by season, units, drawdown, half-seasons up, without the 5 best, legs hit, and HOW OFTEN ITS SLIP IS U8'S SLIP (same 4 legs) or shares 3+ legs with it -
a new slip only adds something if it is a different slip.
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


def take(pl, gm, pr, k, gcap, diff=False):
    out = []; games = {}; players = set(); props = set()
    for i in range(len(pl)):
        if pl[i] in players or games.get(gm[i], 0) >= gcap or (diff and pr[i] in props):
            continue
        out.append(i); players.add(pl[i]); games[gm[i]] = games.get(gm[i], 0) + 1; props.add(pr[i])
        if len(out) == k:
            return out
    return None


def main():
    d = P18.load(); d = d[d["app"] == "underdog"].copy(); d["avg"] = (d["blend"] + d["ph"]) / 2
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    h = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, (matchup LIKE '%%vs.%%') home FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'", conn).drop_duplicates(["player_id", "gd"])
    conn.close()
    d = d.merge(h, on=["player_id", "gd"], how="left"); d["home"] = d["home"].fillna(False).astype(bool)
    u8 = {}
    for gd, g in d[d["prop"] != "assists"].sort_values("blend", ascending=False).groupby("gd", sort=True):
        ix = take(g["player_id"].values, g["game_id"].values, g["prop"].values, 4, 2)
        if ix:
            u8[gd] = {(g["player_id"].values[i], g["prop"].values[i]) for i in ix}
    pools = {"every single stat": lambda x: np.ones(len(x), bool), "no assists": lambda x: (x["prop"] != "assists").values, "points": lambda x: (x["prop"] == "points").values,
             "rebounds": lambda x: (x["prop"] == "rebounds").values, "no points": lambda x: (x["prop"] != "points").values, "points + rebounds": lambda x: x["prop"].isin(["points", "rebounds"]).values,
             "home": lambda x: x["home"].values, "away": lambda x: ~x["home"].values, "lines under 10": lambda x: (x["line"] < 10).values, "lines 10+": lambda x: (x["line"] >= 10).values,
             "defensive props": lambda x: x["prop"].isin(["steals", "blocks", "turnovers"]).values, "every prop different": None}
    out = []
    for rn, col in (("blend", "blend"), ("model", "ph"), ("average", "avg")):
        for pn, pf in pools.items():
            x = d if pf is None else d[pf(d)]
            days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
            for (st, k) in (("P", 3), ("F", 3), ("F", 4), ("F", 5)):
                for gcap in (1, 2):
                    rows = []; legs = []; same = 0; near = 0
                    for gd, g in days:
                        ix = take(g["player_id"].values, g["game_id"].values, g["prop"].values, k, gcap, diff=pf is None)
                        if ix is None:
                            continue
                        hh = g["hit"].values[ix]; legs.extend(hh); key = {(g["player_id"].values[i], g["prop"].values[i]) for i in ix}; o = len(key & u8.get(gd, set()))
                        same += o == 4 and k == 4; near += o >= min(3, k)
                        rows.append((gd, g["season"].iloc[0], R.UD[(st, k)].get(int(hh.sum()), 0.0) - 1))
                    t = pd.DataFrame(rows, columns=["gd", "s", "u"])
                    if len(t) < 120:
                        continue
                    per = [t[t["s"] == s]["u"] for s in R.SEAS]; cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); blocks = []
                    for s in R.SEAS:
                        ts = t[t["s"] == s]; hf = len(ts) // 2; blocks += [ts["u"].iloc[:hf].sum(), ts["u"].iloc[hf:].sum()]
                    out.append((t["u"].mean(), all(len(p) >= 10 and p.sum() > 0 for p in per), f"{k}{'F' if st == 'F' else 'S'} | {rn} | {pn} | {gcap} a game",
                                "/".join(f"{100 * p.mean():+.0f}" if len(p) else "-" for p in per), t["u"].sum(), len(t), dd, sum(b > 0 for b in blocks), t["u"].sum() - t["u"].nlargest(5).sum(), np.mean(legs), same / len(t), near / len(t)))
    ok = sorted([o for o in out if o[1] and o[8] > 0 and o[7] >= 5], key=lambda o: -o[0])
    print(f"P25|cells {len(out)}; positive in every season {sum(o[1] for o in out)}; also positive without the 5 best and 5+ half-seasons up: {len(ok)}", flush=True)
    for o in ok[:45]:
        print(f"P25|  {o[2]:48s}: {o[3]} | {100 * o[0]:+.0f}% ({o[4]:+.1f} u, {o[5]}) | drawdown {o[6]:.1f} | half-seasons {o[7]}/6 | without the 5 best {o[8]:+.1f} | legs hit {100 * o[9]:.1f}% | same slip as U8 {100 * o[10]:.0f}% | 3+ legs shared {100 * o[11]:.0f}%", flush=True)
    print("P25|DONE", flush=True)


if __name__ == "__main__":
    main()
