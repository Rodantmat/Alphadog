#!/usr/bin/env python3
"""
SEASON-WIDE coverage: what share of every PrizePicks window board leg has a baseline probability in
nba_score.baseline_history, per prop, with the shared name resolution applied (exact -> override ->
unambiguous alias). This is THE number that says how much of the board the engine can score each day.

Buckets per leg: matched | name_unresolved | player_missing_that_day | line_out_of_range | line_gap.
Runs on the runner (pandas), not in Postgres - the board is 27M rows and the history 12M.

Env: DATABASE_URL, COVER_SEASON=2025-26|2024-25
"""
import os
import sys

import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import NAME_OVERRIDES, build_alias_index, norm_name, resolve  # noqa: E402

MARKET_TO_PROP = {
    "player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made",
    "player_blocks": "blocks", "player_steals": "steals", "player_turnovers": "turnovers",
    "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast",
    "player_rebounds_assists": "reb_ast", "player_blocks_steals": "stocks", "player_double_double": "double_double",
}


def main():
    season = os.environ.get("COVER_SEASON", "2025-26")
    lo, hi = ("2025-10-21", "2026-04-12") if season == "2025-26" else ("2024-10-22", "2025-04-13")
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    board = pd.read_sql("""SELECT DISTINCT game_date, player, replace(market_key,'_alternate','') AS mk, line
                           FROM nba_market.board_snapshots
                           WHERE bookmaker='prizepicks' AND snapshot_label='window' AND game_date BETWEEN %s AND %s""",
                        conn, params=(lo, hi))
    hist = pd.read_sql("""SELECT game_date, player_id, prop, line FROM nba_score.baseline_history WHERE season=%s""",
                       conn, params=(season,))
    names = pd.read_sql("SELECT player_id, norm_name FROM nba_ref.player_name_map", conn)
    conn.close()
    print(f"board legs {len(board):,} | history rows {len(hist):,} | names {len(names):,}", flush=True)

    board["prop"] = board["mk"].map(MARKET_TO_PROP)
    board = board[board["prop"].notna()].copy()
    board["nm"] = board["player"].map(norm_name)
    id_by_norm = dict(zip(names["norm_name"], names["player_id"]))
    hist["player_id"] = hist["player_id"].astype(str)
    active = set(names[names["player_id"].isin(hist["player_id"].unique())]["norm_name"])
    alias_idx = build_alias_index(active)

    def rid(nm):
        r, how = resolve(nm, active, alias_idx)
        return (id_by_norm.get(r) if r else None), how
    res = board["nm"].map(rid)
    board["player_id"] = [x[0] for x in res]
    board["how"] = [x[1] for x in res]
    print("resolution:", board["how"].value_counts().to_dict(), flush=True)

    rng = hist.groupby(["game_date", "player_id", "prop"])["line"].agg(["min", "max"]).reset_index()
    board["game_date"] = pd.to_datetime(board["game_date"]).dt.date
    rng["game_date"] = pd.to_datetime(rng["game_date"]).dt.date
    hist["game_date"] = pd.to_datetime(hist["game_date"]).dt.date
    b = board.merge(rng, on=["game_date", "player_id", "prop"], how="left")
    exact = hist[["game_date", "player_id", "prop", "line"]].drop_duplicates().assign(hit=1)
    b = b.merge(exact, on=["game_date", "player_id", "prop", "line"], how="left")
    b["bucket"] = "matched"
    b.loc[b["hit"].isna() & b["min"].notna() & (b["line"] >= b["min"]) & (b["line"] <= b["max"]), "bucket"] = "line_gap"
    b.loc[b["hit"].isna() & b["min"].notna() & ((b["line"] < b["min"]) | (b["line"] > b["max"])), "bucket"] = "line_out_of_range"
    b.loc[b["hit"].isna() & b["min"].isna() & b["player_id"].notna(), "bucket"] = "player_missing_that_day"
    b.loc[b["player_id"].isna(), "bucket"] = "name_unresolved"

    tab = b.pivot_table(index="prop", columns="bucket", values="line", aggfunc="size", fill_value=0)
    tab["legs"] = tab.sum(axis=1)
    tab["matched_pct"] = (100 * tab.get("matched", 0) / tab["legs"]).round(1)
    tab = tab.sort_values("legs", ascending=False)
    print(f"\nSEASON COVERAGE prizepicks window {season}")
    print(tab.to_string())
    tot = tab["legs"].sum()
    print(f"\nTOTAL legs {tot:,} | matched {tab.get('matched',0).sum():,} ({100*tab.get('matched',0).sum()/tot:.1f}%)", flush=True)


if __name__ == "__main__":
    main()
