#!/usr/bin/env python3
"""
PUSHED LEGS OF REGULAR LINES (NBA_HONEST_REBUILD.md 8x). Writes ONLY the scratch table nba_score._lr_legs_push.
The honest leg table keeps win / loss legs. A regular leg whose stat ended exactly on the line (a push) is real on the board and can sit in a real slip, so
the "as placed" tests need it WITH its model numbers. This table holds those legs (both sides, PrizePicks regular lines and Underdog 1.0x lines, single
stats and combos), shaped like _lr_legs_h with hit NULL. research_leg_model_h.py scores them out of sample (never trains on them).
Env: DATABASE_URL.
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

COLS = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "steals": ["stl"], "blocks": ["blk"], "turnovers": ["tov"], "stocks": ["stl", "blk"],
        "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "pra": ["pts", "reb", "ast"]}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""", conn).drop_duplicates(["player_id", "gd"])
    pp = pd.read_sql("""SELECT DISTINCT game_date::text gd, nm, base_market mk, line::float8 line FROM nba_market.pp_leg_price
                        WHERE snapshot_label = 'window' AND kind = 'standard' AND game_date < current_date AND base_market = ANY(%s) AND NOT coalesce(kind_position_mismatch, false)""",
                     conn, params=(list(LH.MK),))
    ud = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key mk, line::float8 line FROM nba_market.board_snapshots
                        WHERE bookmaker = 'underdog' AND snapshot_label = 'window' AND game_date < current_date AND market_key = ANY(%s)
                          AND coalesce(multiplier, round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2)) = 1.0""",
                     conn, params=(list(LH.MK),))
    late = pd.DataFrame(conn.execute(LH.LATE_SQL, {"d0": "2024-10-01"}).fetchall(), columns=["app", "gd", "player_id"]); late["gd"] = late["gd"].astype(str)
    H = {}
    for s in ("2024-25", "2025-26", "2026-27"):
        H.update(LH.ladders(conn, s))
    out = []
    for app, b, kind, tier, m in (("prizepicks", pp, "standard", "0", 1.0), ("underdog", ud, "R", "R", 1.8708)):
        b = b.copy(); b["player_id"] = b["nm"].map(ids); b["prop"] = b["mk"].map(LH.MK); b = b[b["player_id"].notna() & (b["line"] % 1 == 0)]
        lt = late[late["app"] == app][["gd", "player_id"]].drop_duplicates().assign(late=1)
        b = b.merge(lt, on=["gd", "player_id"], how="left"); b = b[b["late"].isna()]
        b = b.merge(gl, on=["player_id", "gd"], how="inner")
        stat = np.full(len(b), np.nan)
        for p_, cs in COLS.items():
            k = (b["prop"] == p_).values
            if k.any():
                stat[k] = sum(b.loc[k, c].values for c in cs)
        b = b[stat == b["line"].values].drop_duplicates(["gd", "player_id", "prop", "line"])
        for side, ov in (("Over", True), ("Under", False)):
            x = b.copy(); x["side"] = side
            x["ph"] = LH.attach(x["gd"].values, x["player_id"].values, x["prop"].values, x["line"].values, np.full(len(x), ov), H)
            x["app"] = app; x["src"] = "real"; x["kind"] = kind; x["tier"] = tier; x["m"] = m
            x["season"] = np.where(x["gd"] < "2025-08-01", "2024-25", np.where(x["gd"] < "2026-08-01", "2025-26", "2026-27"))
            out.append(x[["app", "src", "season", "gd", "player_id", "prop", "side", "line", "kind", "tier", "m", "ph"]])
        print(f"PU|{app}: pushed regular lines {len(b):,} on {b['gd'].nunique()} slates", flush=True)
    o = pd.concat(out, ignore_index=True)
    conn.execute("DROP TABLE IF EXISTS nba_score._lr_legs_push")
    conn.execute("""CREATE TABLE nba_score._lr_legs_push (app text, src text, season text, game_date date, player_id text, prop text, side text, line float8, kind text, tier text,
                    m float8, hit int, ph float8, p_stored float8)""")
    with conn.cursor() as cur:
        with cur.copy("COPY nba_score._lr_legs_push (app, src, season, game_date, player_id, prop, side, line, kind, tier, m, ph) FROM STDIN") as cp:
            for r in o.itertuples(index=False):
                cp.write_row((r.app, r.src, r.season, r.gd, r.player_id, r.prop, r.side, float(r.line), r.kind, r.tier, float(r.m), None if r.ph != r.ph else float(r.ph)))
    conn.commit(); conn.close()
    print(f"PU|wrote {len(o):,} pushed legs (both sides) to nba_score._lr_legs_push; with an honest number {100 * o['ph'].notna().mean():.0f}%", flush=True)
    print("PU|DONE", flush=True)


if __name__ == "__main__":
    main()
