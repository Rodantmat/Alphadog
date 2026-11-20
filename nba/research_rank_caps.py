#!/usr/bin/env python3
"""
PASS 5 - RANK CAPS AND SLIP COMPOSITION OF THE CANDIDATE. READ-ONLY. (NBA_HONEST_REBUILD.md 8w)
Owner 2026-11-19 20:48 PT: "test slip composition, rank caps and all variations possible". The candidate pool: regular single-stat Unders of the slate ranked
by the walk-forward blend (and, as a second ranker, the honest baseline), one leg a player.
  1. RANK WINDOWS   a slip from ranks a .. a+k-1 for a = 1 .. 9 : where does the edge stop? (the cap)
  2. ROUND ROBINS   every k-pick combination of the top N (N = 3 .. 6, k = 2 .. 4): more slips from the same few legs
  3. GAME RULE      one leg a game (as the battery) against no rule
  4. BEST EITHER SIDE instead of Unders only
Underdog: Standard 2 / 3 / 4 (3.5 / 6.5 / 12), Flex 3 / 4. PrizePicks: Power 2 / 3 / 4 (3 / 6 / 10), Flex 3 / 4 / 5. Per cell: slips, ROI by season, pooled ROI,
units, max drawdown, longest drought (slates without a paying slip).
Env: DATABASE_URL.
"""
import os
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

COMBO = ("pra", "pts_reb", "pts_ast", "reb_ast", "stocks", "fantasy_score", "double_double")
TAB = {"underdog": {"2S": (2, {2: 3.5}), "3S": (3, {3: 6.5}), "4S": (4, {4: 12.0}), "3F": (3, {3: 3.25, 2: 1.09}), "4F": (4, {4: 7.2, 3: 1.4})},
       "prizepicks": {"2P": (2, {2: 3.0}), "3P": (3, {3: 6.0}), "4P": (4, {4: 10.0}), "3F": (3, {3: 3.0, 2: 1.0}), "4F": (4, {4: 6.0, 3: 1.5}), "5F": (5, {5: 10.0, 4: 2.0, 3: 0.4})}}
SEAS = ["2024-25", "2025-26", "2026-27"]


def summ(rows):
    """rows: (gd, season, list of slip profits)"""
    if not rows:
        return "-"
    t = pd.DataFrame([(gd, s, sum(p), len(p), max(p) > 0) for gd, s, p in rows], columns=["gd", "s", "u", "n", "w"]).sort_values("gd")
    per = "/".join(f"{100 * x['u'].sum() / x['n'].sum():+.0f}" if len(x) else "-" for x in (t[t["s"] == s] for s in SEAS))
    cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = c = 0
    for w in t["w"].values:
        c = 0 if w else c + 1; dr = max(dr, c)
    return f"{per} | pooled {100 * t['u'].sum() / t['n'].sum():+.1f}% on {int(t['n'].sum())} slips, {t['u'].sum():+.1f} u, drawdown {dd:.1f}, drought {dr}"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.p_blend IS NOT NULL AND v.prop <> ALL(%s)""", conn, params=(list(COMBO),))
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]; tabs = TAB[app]
        for rk, side in (("blend", "Under"), ("ph", "Under"), ("blend", "either side")):
            x = a if side != "Under" else a[a["is_under"]]
            x = x[x[rk].notna()].sort_values(rk, ascending=False).drop_duplicates(["gd", "player_id"])
            days = {}
            for gd, g in x.groupby("gd", sort=True):
                h1 = []; games = set()
                for hit, game in zip(g["hit"].values, g["game_id"].values):     # one leg a game
                    if game in games:
                        continue
                    h1.append(int(hit)); games.add(game)
                    if len(h1) >= 14:
                        break
                days[gd] = (g["season"].iloc[0], h1, [int(v) for v in g["hit"].values[:14]])
            print(f"\nRC|================ {app.upper()} - regular single-stat legs, {side}, ranked by {('the blend' if rk == 'blend' else 'the honest baseline')}; ROI 2024-25 / 2025-26 / 2026-27 ================", flush=True)
            print("RC|1. RANK WINDOWS (one slip from ranks a .. a+k-1, one leg a game)", flush=True)
            for st, (k, table) in tabs.items():
                for a0 in range(1, 10):
                    rows = [(gd, s, [table.get(sum(h[a0 - 1:a0 - 1 + k]), 0.0) - 1]) for gd, (s, h, _) in days.items() if len(h) >= a0 - 1 + k]
                    print(f"RC|  {st} ranks {a0}-{a0 + k - 1}: {summ(rows)}", flush=True)
            print("RC|2. ROUND ROBINS (every k-pick combination of the top N, one leg a game)", flush=True)
            for st, (k, table) in tabs.items():
                for N in range(max(3, k + 1), 7):
                    rows = [(gd, s, [table.get(sum(h[i] for i in c), 0.0) - 1 for c in combinations(range(N), k)]) for gd, (s, h, _) in days.items() if len(h) >= N]
                    print(f"RC|  {st} all combinations of the top {N} ({len(list(combinations(range(N), k)))} slips a slate): {summ(rows)}", flush=True)
            print("RC|3. GAME RULE (top k, 1 slip): one leg a game vs no rule", flush=True)
            for st, (k, table) in tabs.items():
                r1 = [(gd, s, [table.get(sum(h[:k]), 0.0) - 1]) for gd, (s, h, _) in days.items() if len(h) >= k]
                r2 = [(gd, s, [table.get(sum(h2[:k]), 0.0) - 1]) for gd, (s, _, h2) in days.items() if len(h2) >= k]
                print(f"RC|  {st}: one a game {summ(r1)}  ||  no rule {summ(r2)}", flush=True)
    print("RC|DONE", flush=True)


if __name__ == "__main__":
    main()
