#!/usr/bin/env python3
"""
PASS 6 - BETR: THE SAME FAMILY ON THE ONE APP NOT YET TESTED. READ-ONLY. (NBA_HONEST_REBUILD.md 8x)
Betr has no per-leg multiplier: a slip pays by its table (Perfect / Dynamic), and a slip made only of Less picks is paid from a DISCOUNTED table. Its real
boards exist from 2025-11-23. Test: regular single-stat legs on Betr's raw pick-time board, ranked by the certified honest baseline (pushes left in and
dropped from the slip as the app does; players who did not play cannot be ranked from history), one leg a player and a game:
  A  all Unders, top k                      -> paid from the all-Less table
  B  top k-1 Unders + the best Over         -> paid from the regular table
  C  best legs of either side, top k        -> regular table unless all happen to be Less
Structures Perfect 2-5 and Dynamic 3-6 as the stored rule 'betr_payout_v1' gives them. ROI by season, pooled, units, drawdown, drought; and the leg hit rate
by rank against what each table needs.
Env: DATABASE_URL.
"""
import json
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

SINGLE = {"points": "pts", "rebounds": "reb", "assists": "ast", "threes_made": "fg3m", "steals": "stl", "blocks": "blk", "turnovers": "tov"}
MKS = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers"}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    BR = conn.execute("SELECT rule_json FROM nba_config.pp_slip_rules WHERE rule_key='betr_payout_v1'").fetchone()[0]
    BR = BR if isinstance(BR, dict) else json.loads(BR)
    print("BE|tables: " + json.dumps({k: BR[k] for k in ("perfect_regular", "perfect_all_less", "dynamic_regular", "dynamic_all_less") if k in BR})[:900], flush=True)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2025-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    b = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, side, line::float8 line FROM nba_market.board_snapshots
                       WHERE bookmaker = 'betr_us_dfs' AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s)""", conn, params=(list(MKS),))
    tips = pd.DataFrame(conn.execute("""WITH tip AS (SELECT game_date, nba_ref.norm_name(player) nm, min(commence_time) tip FROM nba_market.board_snapshots
                                                     WHERE snapshot_label = 'window' AND commence_time IS NOT NULL AND game_date >= '2025-10-01' GROUP BY 1, 2),
                                             snap AS (SELECT game_date, max(snapshot_ts) ts FROM nba_market.board_snapshots WHERE snapshot_label = 'window' AND bookmaker = 'betr_us_dfs' GROUP BY 1)
                                        SELECT t.game_date::text, t.nm FROM tip t JOIN snap s USING (game_date) WHERE s.ts >= t.tip""").fetchall(), columns=["gd", "nm"]).assign(late=1)
    H = {}
    for s in ("2025-26", "2026-27"):
        H.update(LH.ladders(conn, s))
    conn.close()
    b = b.merge(tips, on=["gd", "nm"], how="left"); nl = int(b["late"].notna().sum()); b = b[b["late"].isna()]
    b["player_id"] = b["nm"].map(ids); b["prop"] = b["mk"].map(MKS); b = b[b["player_id"].notna()]
    b["over"] = b["side"].str.lower().str[0].isin(["o", "m", "h"])
    b = b.drop_duplicates(["gd", "player_id", "prop", "over"]).merge(gl, on=["player_id", "gd"], how="inner")
    stat = np.full(len(b), np.nan)
    for p_, c_ in SINGLE.items():
        k_ = (b["prop"] == p_).values; stat[k_] = b.loc[k_, c_].values
    b["res"] = np.where(stat == b["line"].values, 2, np.where(b["over"], stat > b["line"].values, stat < b["line"].values).astype(int))
    b["ph"] = LH.attach(b["gd"].values, b["player_id"].values, b["prop"].values, b["line"].values, b["over"].values, H)
    b["season"] = np.where(b["gd"] < "2026-08-01", "2025-26", "2026-27"); b = b[b["ph"].notna()]
    print(f"BE|Betr regular single-stat legs of players who played {len(b):,} on {b['gd'].nunique()} slates (in-play rows removed {nl:,}); by season {b.groupby('season')['gd'].nunique().to_dict()} slates; "
          f"Under hit {b[(~b['over']) & (b['res'] != 2)]['res'].mean():.3f}, Over hit {b[b['over'] & (b['res'] != 2)]['res'].mean():.3f}, push {100 * (b['res'] == 2).mean():.2f}%", flush=True)
    un = b[~b["over"]].sort_values("ph", ascending=False).drop_duplicates(["gd", "player_id"]); un["rk"] = un.groupby("gd").cumcount() + 1
    print("BE|Unders by rank (hit of the decided): " + " | ".join(f"#{lo}-{hi} {un[(un['rk'] >= lo) & (un['rk'] <= hi) & (un['res'] != 2)]['res'].mean():.3f} (n{((un['rk'] >= lo) & (un['rk'] <= hi)).sum()})"
                                                                 for lo, hi in ((1, 1), (2, 2), (3, 4), (5, 6), (7, 10), (11, 20), (21, 40))), flush=True)

    def pay(legs, mode):
        live = [l for l in legs if l[0] != 2]; n = len(live)
        if n < 2:
            return 1.0
        h = sum(l[0] for l in live); allless = all(not l[1] for l in live)
        if mode == "perfect":
            return float(BR["perfect_all_less" if allless else "perfect_regular"].get(str(n), 0.0)) if h == n else 0.0
        tb = BR["dynamic_all_less" if allless else "dynamic_regular"].get(str(n))
        return float(tb.get(str(h), 0.0)) if tb else 1.0

    def take(g, k):
        out = []; games = set(); players = set()
        for res, ov, game, pl in zip(g["res"].values, g["over"].values, g["game_id"].values, g["player_id"].values):
            if game in games or pl in players:
                continue
            out.append((int(res), bool(ov))); games.add(game); players.add(pl)
            if len(out) == k:
                return out
        return None

    days = {gd: g for gd, g in b.sort_values("ph", ascending=False).groupby("gd", sort=True)}
    for comp in ("A all Unders", "B top k-1 Unders + best Over", "C best of either side"):
        print(f"\nBE|=== {comp} ===", flush=True)
        for mode, ks in (("perfect", (2, 3, 4, 5)), ("dynamic", (3, 4, 5, 6))):
            for k in ks:
                rows = []
                for gd, g in days.items():
                    if comp.startswith("A"):
                        legs = take(g[~g["over"]], k)
                    elif comp.startswith("C"):
                        legs = take(g, k)
                    else:
                        u = take(g[~g["over"]], k - 1)
                        if u is None:
                            continue
                        upl = set(g[~g["over"]].drop_duplicates("player_id")["player_id"].values[:k - 1]); o = take(g[g["over"] & ~g["player_id"].isin(upl)], 1)
                        legs = None if o is None else u + o
                    if legs:
                        rows.append((gd, g["season"].iloc[0], pay(legs, mode) - 1))
                if not rows:
                    continue
                t = pd.DataFrame(rows, columns=["gd", "s", "u"]).sort_values("gd"); cum = np.concatenate([[0], np.cumsum(t["u"].values)]); dd = float((np.maximum.accumulate(cum) - cum).max()); dr = c = 0
                for w in (t["u"].values > 0):
                    c = 0 if w else c + 1; dr = max(dr, c)
                print(f"BE|  {k}-pick {mode:8s}: " + " | ".join(f"{s} {100 * x['u'].mean():+.1f}% ({len(x)} slips, {x['u'].sum():+.1f} u)" for s, x in t.groupby("s")) +
                      f" | pooled {100 * t['u'].mean():+.1f}%, {t['u'].sum():+.1f} u, drawdown {dd:.1f}, drought {dr}", flush=True)
    print("BE|DONE", flush=True)


if __name__ == "__main__":
    main()
