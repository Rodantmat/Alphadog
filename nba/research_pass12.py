#!/usr/bin/env python3
"""
PASS 12 - IS ANYTHING OF THE OLD SLIP STRATEGIES SALVAGEABLE? READ-ONLY. (NBA_HONEST_REBUILD.md 8ac; owner 2026-11-19 23:34 PT)
The retired strategies lived on cells the new ones do not use: steals / blocks / turnovers / stocks and the combo props, Overs, both sides mixed. Their own
rules cannot be re-run honestly (they rank by a calibration fitted on the void history), but their CELLS can: every prop x side on the certified legs,
regular lines, the top of the slate by the blend and by the model alone, one leg a player and a game.
Underdog 2-pick Standard, 3-pick Flex; PrizePicks 2-pick Power, 3-pick Power, 4-pick Flex, 5-pick Flex. ROI and units by season.
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

SEAS = ["2024-25", "2025-26", "2026-27"]
TAB = {"underdog": {"2S": (2, {2: 3.5}), "3F": (3, {3: 3.25, 2: 1.09})},
       "prizepicks": {"2P": (2, {2: 3.0}), "3P": (3, {3: 6.0}), "4F": (4, {4: 6.0, 3: 1.5}), "5F": (5, {5: 10.0, 4: 2.0, 3: 0.4})}}
GROUPS = {"steals": ["steals"], "blocks": ["blocks"], "turnovers": ["turnovers"], "stocks": ["stocks"], "steals+blocks+turnovers+stocks": ["steals", "blocks", "turnovers", "stocks"],
          "points": ["points"], "rebounds": ["rebounds"], "assists": ["assists"], "threes": ["threes_made"], "pra": ["pra"], "pts_reb": ["pts_reb"], "pts_ast": ["pts_ast"],
          "reb_ast": ["reb_ast"], "all combos": ["pra", "pts_reb", "pts_ast", "reb_ast", "stocks"], "every prop": None}


def take(g, k):
    out = []; games = set(); players = set()
    for i, (pl, game) in enumerate(zip(g["player_id"].values, g["game_id"].values)):
        if game in games or pl in players:
            continue
        out.append(i); games.add(game); players.add(pl)
        if len(out) == k:
            return g["hit"].values[out]
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    d = pd.read_sql("""SELECT v.app, v.season, v.game_date::text gd, v.player_id, v.prop, v.is_under, v.hit::int hit, v.p_blend::float8 blend, v.p_honest_baseline::float8 ph, g.game_id::text game_id
                       FROM nba_score.v_legs_honest v LEFT JOIN nba_stats.player_game_log g ON g.nba_player_id::text = v.player_id AND g.game_date = v.game_date
                       WHERE v.app IN ('underdog', 'prizepicks') AND v.kind = 'regular' AND v.p_blend IS NOT NULL""", conn)
    conn.close()
    d["game_id"] = d["game_id"].fillna("g" + d["player_id"])
    for app in ("underdog", "prizepicks"):
        a = d[d["app"] == app]
        print(f"\nP12|================ {app.upper()} - regular lines; ROI 2024-25 / 2025-26 / 2026-27 (units, slips) ================", flush=True)
        for gname, props in GROUPS.items():
            x0 = a if props is None else a[a["prop"].isin(props)]
            for side in ("Under", "Over", "either"):
                x1 = x0 if side == "either" else x0[x0["is_under"] == (side == "Under")]
                for rk in ("blend", "ph"):
                    x = x1[x1[rk].notna()].sort_values(rk, ascending=False)
                    days = {gd: g for gd, g in x.groupby("gd", sort=True)}
                    cells = []; keep = False
                    for st, (k, table) in TAB[app].items():
                        rows = [(g["season"].iloc[0], table.get(int(h.sum()), 0.0) - 1) for g, h in ((g, take(g, k)) for g in days.values()) if h is not None]
                        if len(rows) < 60:
                            cells.append(f"{st} -"); continue
                        t = pd.DataFrame(rows, columns=["s", "u"]); per = [t[t["s"] == s]["u"] for s in SEAS]
                        pos = all(p.sum() > 0 for p in per if len(p)); keep = keep or pos
                        cells.append(f"{st} " + "/".join(f"{100 * p.mean():+.0f}" if len(p) else "-" for p in per) + f" ({t['u'].sum():+.0f} u, {len(t)})" + (" ALL+" if pos else ""))
                    print(f"P12|  {gname:30s} {side:6s} by {'the blend' if rk == 'blend' else 'the model'}: " + " | ".join(cells) + ("   <== positive every season" if keep else ""), flush=True)
    print("P12|DONE", flush=True)


if __name__ == "__main__":
    main()
