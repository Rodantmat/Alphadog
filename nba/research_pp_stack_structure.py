#!/usr/bin/env python3
"""
S6a - STRUCTURE WITHOUT A MODEL: do correlated stacks of PrizePicks REGULAR lines beat the Power / Flex tables? READ-ONLY. (NBA_HONEST_REBUILD.md, D7 step c)
S5 verdict: no single leg has an edge. A slip can still be worth more than its legs when the legs move together: a Power slip pays only when ALL hit,
so positive correlation raises P(all) above the product. This test uses results only (no model, no modelled price): PrizePicks regular lines of three
seasons (price fixed and known: Power 3 / 6 / 10 / 20 / 37.5x; Flex 3-pick 3 / 1, 4-pick 6 / 1.5, 5-pick 10 / 2 / 0.4, 6-pick 25 / 2 / 0.4).
Stack types (one leg per player, random prop among those the player has on the board that day):
  game-U / game-O       all legs from ONE game, all Under / all Over
  team-U / team-O       all legs from ONE team
  split                 one game: one team all Over, the other team all Under (pace / blowout story)
  vol-U                 one game, all Under, volume props only (points, rebounds, assists and their sums)
  cross-U / cross-O     every leg from a DIFFERENT game (control: should match the product of single hit rates)
For 2..6 picks: P(all hit), the product of single-leg rates of the same legs (independence), Power return, Flex return; by season, 90% range re-drawing slates.
Quoted same-game Power payouts read ~3.5% under the table (ladder round 2026-11-19) - shown as "after haircut".
Env: DATABASE_URL, SS_N (samples per game and size, 300).
"""
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

N = int(os.environ.get("SS_N") or 300)
POWER = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
FLEX = {3: {3: 3.0, 2: 1.0}, 4: {4: 6.0, 3: 1.5}, 5: {5: 10.0, 4: 2.0, 3: 0.4}, 6: {6: 25.0, 5: 2.0, 4: 0.4}}
VOL = {"points", "rebounds", "assists", "pra", "pts_reb", "pts_ast", "reb_ast"}
rng = np.random.default_rng(3)


def draw(pl, k, n):
    """pl: list of per-player arrays of hits (one per available leg). n stacks of k distinct players, one random leg each -> (n, k) hits"""
    P = len(pl)
    if P < k:
        return None
    M = np.column_stack([a[rng.integers(len(a), size=n)] for a in pl])
    idx = np.argsort(rng.random((n, P)), axis=1)[:, :k]
    return np.take_along_axis(M, idx, axis=1)


def draw_cross(pools, k, n):
    """every leg from a different game: pools = one list of per-player arrays per game"""
    M = np.column_stack([np.where(True, 0, 0) + np.array([(lambda a: a[rng.integers(len(a))])(p[i]) for i in rng.integers(len(p), size=n)]) for p in pools])
    idx = np.argsort(rng.random((n, len(pools))), axis=1)[:, :k]
    return np.take_along_axis(M, idx, axis=1)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, hit::int hit FROM nba_score._lr_legs_h
                        WHERE app = 'prizepicks' AND kind = 'standard' AND hit IS NOT NULL AND tier NOT LIKE '%%-u'""", conn)
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, team_id::text team_id FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0", conn)
    conn.close()
    df = df.merge(gl.drop_duplicates(["player_id", "gd"]), on=["player_id", "gd"], how="inner"); df["under"] = ~df["side"].str.lower().str.startswith("o")
    print(f"SS|regular legs {len(df):,} on {df['gd'].nunique()} slates, {df['game_id'].nunique()} games; single-leg hit Under {df[df['under']]['hit'].mean():.3f} Over {df[~df['under']]['hit'].mean():.3f}", flush=True)
    res = defaultdict(list)                                  # (type, k) -> list of (season, gd, hits-count array, mean single rate product)
    slates = {gd: g for gd, g in df.groupby("gd")}
    for gd, g in slates.items():
        season = g["season"].iloc[0]
        by = {}                                              # (game, team, under) -> list of per-player hit arrays ; plus volume variant
        for (gm, tm, un, pid), x in g.groupby(["game_id", "team_id", "under", "player_id"]):
            by.setdefault((gm, tm, un), []).append(x["hit"].values.astype(float))
            v = x[x["prop"].isin(VOL)]
            if len(v):
                by.setdefault((gm, tm, un, "vol"), []).append(v["hit"].values.astype(float))
        games = defaultdict(set)
        for key in by:
            games[key[0]].add(key[1])
        for k in range(2, 7):
            for gm, teams in games.items():
                teams = sorted(teams)
                for un, nm in ((True, "U"), (False, "O")):
                    allp = [a for t in teams for a in by.get((gm, t, un), [])]
                    h = draw(allp, k, N)
                    if h is not None:
                        res[("game-" + nm, k)].append((season, gd, h.sum(1)))
                    for t in teams:
                        h = draw(by.get((gm, t, un), []), k, max(60, N // 2))
                        if h is not None:
                            res[("team-" + nm, k)].append((season, gd, h.sum(1)))
                allv = [a for t in teams for a in by.get((gm, t, True, "vol"), [])]
                h = draw(allv, k, N)
                if h is not None:
                    res[("vol-U", k)].append((season, gd, h.sum(1)))
                if len(teams) == 2:
                    for a, b in ((0, 1), (1, 0)):
                        ka = k // 2; kb = k - ka
                        ha = draw(by.get((gm, teams[a], False), []), ka, N // 2) if ka else None; hb = draw(by.get((gm, teams[b], True), []), kb, N // 2)
                        if hb is not None and (ka == 0 or ha is not None):
                            res[("split", k)].append((season, gd, (ha.sum(1) if ka else 0) + hb.sum(1)))
            glist = sorted(games)
            if len(glist) >= k:                              # control: every leg from a different game
                for un, nm in ((True, "U"), (False, "O")):
                    pools = [[a for t in sorted(games[gm]) for a in by.get((gm, t, un), [])] for gm in glist]; pools = [p for p in pools if p]
                    if len(pools) >= k:
                        hits = draw_cross(pools, k, N).sum(1)
                        res[("cross-" + nm, k)].append((season, gd, hits))
    print("SS|type      picks season   stacks    P(all)  indep   lift | Power return [90% range] after haircut | Flex return [90% range]", flush=True)
    single = {True: {s: g["hit"].mean() for s, g in df[df["under"]].groupby("season")}, False: {s: g["hit"].mean() for s, g in df[~df["under"]].groupby("season")}}
    for typ in ("cross-U", "cross-O", "game-U", "game-O", "team-U", "team-O", "vol-U", "split"):
        for k in range(2, 7):
            rows = res.get((typ, k), [])
            for s in ["ALL"] + sorted({r[0] for r in rows}):
                rr = [r for r in rows if s == "ALL" or r[0] == s]
                if not rr:
                    continue
                per = defaultdict(list)                      # slate -> per-game arrays (each game equal weight inside the slate)
                for _, gd, h in rr:
                    per[gd].append(h)
                gds = sorted(per)
                pw = np.array([np.mean([np.mean(h == k) for h in per[g]]) for g in gds]) * POWER[k] - 1
                if k >= 3:
                    fx = np.array([np.mean([np.mean(sum(FLEX[k].get(i, 0) * (h == i) for i in range(k + 1))) for h in per[g]]) for g in gds]) - 1
                pall = (pw.mean() + 1) / POWER[k]; lr = np.mean([np.mean([h.mean() for h in per[g]]) for g in gds]) / k
                bs = [pw[rng.integers(len(gds), size=len(gds))].mean() for _ in range(400)]
                line = (f"SS|{typ:9s} {k}     {s:8s} {sum(len(h) for g in gds for h in per[g]):9,} {pall:.4f} {lr ** k:.4f} {pall / lr ** k:5.2f}x | "
                        f"{100 * pw.mean():+6.1f}% [{100 * np.quantile(bs, .05):+.1f}% .. {100 * np.quantile(bs, .95):+.1f}%] {100 * ((pw.mean() + 1) * .965 - 1):+6.1f}%")
                if k >= 3:
                    bf = [fx[rng.integers(len(gds), size=len(gds))].mean() for _ in range(400)]
                    line += f" | {100 * fx.mean():+6.1f}% [{100 * np.quantile(bf, .05):+.1f}% .. {100 * np.quantile(bf, .95):+.1f}%]"
                print(line + f" | leg rate {lr:.3f}", flush=True)
    print("SS|DONE", flush=True)


if __name__ == "__main__":
    main()
