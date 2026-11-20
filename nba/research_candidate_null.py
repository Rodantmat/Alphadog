#!/usr/bin/env python3
"""
PASS 3 - HOW MUCH OF THE CANDIDATE IS LUCK? An exact null for the candidate slips. READ-ONLY. (NBA_HONEST_REBUILD.md 8v)
One slip a slate has few slips a season, and one RANDOM order of the same legs can show +30% by itself (pass 2, PrizePicks). So: for each candidate
structure, draw the slip 4,000 times at RANDOM from the same pool the candidate draws from (regular single-stat Unders of the slate, one leg a player,
one a game), keep the same slates, and see where the candidate's real result sits in that distribution.
  pools     A = every regular single-stat Under on the slate            (does ranking beat "any Under"?)
            B = regular single-stat Unders of ALL props incl. combos    C = both sides, single stats (does it beat "any leg"?)
  slips     underdog 2-pick Standard (3.5x), 3-pick Flex (3.25 / 1.09) ; prizepicks 3-pick Power (6x), 4-pick Flex (6 / 1.5), 5-pick Flex (10 / 2 / 0.4)
  rankers   blend, small gbm, honest baseline, sportsbook
Reported per season and pooled: candidate units and ROI, the null's mean and 95th / 99th percentile, the share of random draws that do as well (p).
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
PLAN = {"underdog": [("2-pick Standard", 2, {2: 3.5}), ("3-pick Flex", 3, {3: 3.25, 2: 1.09}), ("3-pick Standard", 3, {3: 6.5})],
        "prizepicks": [("3-pick Power", 3, {3: 6.0}), ("4-pick Flex", 4, {4: 6.0, 3: 1.5}), ("5-pick Flex", 5, {5: 10.0, 4: 2.0, 3: 0.4}), ("2-pick Power", 2, {2: 3.0})]}
NSIM = 4000
rng = np.random.default_rng(97)


def pick(g, k):
    out = []; games = set()
    for hit, game in g:
        if game in games:
            continue
        out.append(hit); games.add(game)
        if len(out) == k:
            return out
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.hit::int hit, v.p_blend::float8 blend, v.p_small_gbm::float8 gbm_s,
                              v.p_honest_baseline::float8 ph, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.p_blend IS NOT NULL""", conn)
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"]); d["single"] = ~d["prop"].isin(COMBO)
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]
        pools = {"A any regular single-stat Under": a[a["is_under"] & a["single"]], "B any regular Under, combos included": a[a["is_under"]], "C any regular single-stat leg, both sides": a[a["single"]]}
        for nm, k, table in PLAN[app]:
            for rk in ("blend", "gbm_s", "ph"):
                base = pools["A any regular single-stat Under"]
                cand = {}
                for gd, g in base[base[rk].notna()].groupby("gd"):
                    g = g.sort_values(rk, ascending=False).drop_duplicates("player_id")
                    p = pick(list(zip(g["hit"].values, g["game_id"].values)), k)
                    if p is not None:
                        cand[gd] = table.get(sum(p), 0.0) - 1
                days = sorted(cand); seas = {gd: s for gd, s in zip(a["gd"], a["season"])}
                cu = np.array([cand[x] for x in days]); sidx = np.array([seas[x] for x in days])
                print(f"\nCN|=== {app} {nm}, ranked by {rk}: {len(days)} slips; units by season " + ", ".join(f"{s} {cu[sidx == s].sum():+.1f} ({(sidx == s).sum()})" for s in sorted(set(sidx))) + f"; pooled {cu.sum():+.1f} (ROI {100 * cu.mean():+.1f}%) ===", flush=True)
                for pn, pool in pools.items():
                    per_day = {}
                    for gd, g in pool.groupby("gd"):
                        if gd in cand:
                            g = g.drop_duplicates("player_id") if False else g
                            per_day[gd] = (g["hit"].values, g["game_id"].values, g["player_id"].values)
                    sim = np.zeros((NSIM, len(days)))
                    for j, gd in enumerate(days):
                        if gd not in per_day:
                            sim[:, j] = np.nan; continue
                        hit, game, pl = per_day[gd]; n = len(hit)
                        for t in range(NSIM):
                            order = rng.permutation(n); out = 0; cnt = 0; games = set(); players = set()
                            for i in order:
                                if game[i] in games or pl[i] in players:
                                    continue
                                games.add(game[i]); players.add(pl[i]); out += hit[i]; cnt += 1
                                if cnt == k:
                                    break
                            sim[t, j] = (table.get(out, 0.0) - 1) if cnt == k else np.nan
                    tot = np.nansum(sim, axis=1); out_ = [f"pooled: null mean {tot.mean():+.1f}, 95th {np.quantile(tot, .95):+.1f}, 99th {np.quantile(tot, .99):+.1f}, p = {(tot >= cu.sum()).mean():.4f}"]
                    for s in sorted(set(sidx)):
                        ts = np.nansum(sim[:, sidx == s], axis=1); out_.append(f"{s}: null mean {ts.mean():+.1f}, 95th {np.quantile(ts, .95):+.1f}, p = {(ts >= cu[sidx == s].sum()).mean():.3f}")
                    print(f"CN|  against pool {pn}: " + " | ".join(out_), flush=True)
    print("CN|DONE", flush=True)


if __name__ == "__main__":
    main()
