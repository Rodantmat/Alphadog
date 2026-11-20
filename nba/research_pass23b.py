#!/usr/bin/env python3
"""
PASS 23b - UNDERDOG, TWO LEGS A GAME ALLOWED: THE LEAD PRESSED HARDER. READ-ONLY. (NBA_HONEST_REBUILD.md 8aj)
For each ranker x pool x structure: 1 a game (live) against 2 a game - by season, units, drawdown, odd / even days, half-seasons up of 6, without the 5 best slips,
share of slips paid, hit rate of the legs used, and how many of the days the two rules give a DIFFERENT slip (and the result on those days only).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_pass16 as R
import research_pass18 as P18
import research_pass23 as P23


def main():
    d = P18.load(); d = d[d["app"] == "underdog"].copy(); d["avg"] = (d["blend"] + d["ph"]) / 2; d["tri"] = "t" + d["player_id"]
    for rn, col in (("blend", "blend"), ("model", "ph"), ("average", "avg")):
        for pn, pm in (("every single stat", np.ones(len(d), bool)), ("no assists", (d["prop"] != "assists").values)):
            x = d[pm]; days = [(gd, g.sort_values(col, ascending=False)) for gd, g in x.groupby("gd", sort=True)]
            for (st, k) in (("F", 3), ("F", 4), ("F", 5), ("F", 6)):
                rows = {1: [], 2: []}; legs = {1: [], 2: []}
                for gd, g in days:
                    pl = g["player_id"].values; gm = g["game_id"].values; tm = g["tri"].values; hit = g["hit"].values; s = g["season"].iloc[0]; got = {}
                    for cap in (1, 2):
                        ix = P23.take(pl, gm, tm, k, cap, 9)
                        if ix is not None:
                            got[cap] = ix; legs[cap].extend(hit[ix])
                    for cap, ix in got.items():
                        rows[cap].append((gd, s, R.UD[(st, k)].get(int(hit[ix].sum()), 0.0) - 1, cap in got and 1 in got and 2 in got and tuple(got[1]) != tuple(got[2])))
                for cap in (1, 2):
                    t = pd.DataFrame(rows[cap], columns=["gd", "s", "u", "diff"]).reset_index(drop=True)
                    if not len(t):
                        continue
                    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); blocks = []
                    for s in R.SEAS:
                        ts = t[t["s"] == s]; h = len(ts) // 2; blocks += [ts["u"].iloc[:h].sum(), ts["u"].iloc[h:].sum()]
                    df = t[t["diff"]]
                    print(f"P23b|{rn:7s} | {pn:17s} | {k}F | {cap} a game: " + "/".join(f"{100 * t[t['s'] == s]['u'].mean():+.0f}" for s in R.SEAS) + f" | {100 * t['u'].mean():+.0f}% ({t['u'].sum():+.1f} u, {len(t)}) | drawdown {dd:.1f} | "
                          f"odd {100 * t[t.index % 2 == 1]['u'].mean():+.0f}% even {100 * t[t.index % 2 == 0]['u'].mean():+.0f}% | half-seasons up {sum(b > 0 for b in blocks)} of 6 | without the 5 best {t['u'].sum() - t['u'].nlargest(5).sum():+.1f} u | "
                          f"paid {100 * (t['u'] > -1).mean():.0f}% | legs hit {100 * np.mean(legs[cap]):.1f}% | days the rules differ {len(df)}: {df['u'].sum():+.1f} u", flush=True)
    print("P23b|DONE", flush=True)


if __name__ == "__main__":
    main()
