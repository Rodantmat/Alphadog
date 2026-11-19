#!/usr/bin/env python3
"""
S4 - ONE HONEST LEG TABLE PER APP (NBA_HONEST_REBUILD.md section 8b). Writes ONLY the scratch table nba_score._lr_legs_h.
Every graded board leg with: its app price, its result, and the HONEST model probability of its side at its own line (nba_score.baseline_history_h).
  prizepicks  nba_market.pp_leg_price, window snapshot, three seasons (regular / goblin / demon, single stats and combos). Price = the leg's hidden price
              relative to a regular leg (regular 1.0). Goblin / demon: the stored modelled factor re-centred on REAL quotes (research_pp_price_validate.py
              run pv2, "STACKED" fit read as the sharp 6-pick price; held out: unbiased, mean abs error 4.7% goblins, 8.5% demons). Graded on the box score.
  underdog / sleeper / fliff  from nba_score._lr_app_legs (real multipliers; sleeper / fliff earlier seasons are 'derived' from sportsbook lines).
Columns: app, src, season, game_date, player_id, prop, side, line, kind, tier, m (prizepicks: price factor; others: the app's leg multiplier),
         hit, ph (honest probability), p_stored (the number stored today, where kept).
Env: DATABASE_URL, LH_APP (prizepicks | underdog | sleeper | fliff).
"""
import os
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

APPS = (os.environ.get("LH_APP") or "prizepicks").lower().split(",")
APP = APPS[0]
T0 = time.time()
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals",
      "player_blocks": "blocks", "player_turnovers": "turnovers", "player_blocks_steals": "stocks", "player_points_rebounds": "pts_reb",
      "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast", "player_points_rebounds_assists": "pra"}
STAT = {"points": lambda s: s[0], "rebounds": lambda s: s[1], "assists": lambda s: s[2], "threes_made": lambda s: s[3], "steals": lambda s: s[4],
        "blocks": lambda s: s[5], "turnovers": lambda s: s[6], "stocks": lambda s: s[4] + s[5], "pts_reb": lambda s: s[0] + s[1],
        "pts_ast": lambda s: s[0] + s[2], "reb_ast": lambda s: s[1] + s[2], "pra": lambda s: s[0] + s[1] + s[2]}
GRPC = {"rebounds": 6, "assists": 7, "threes_made": 8}        # column of the prop-group dummy in the stacked fit; combos -> 9
COMBO = {"pra", "pts_reb", "pts_ast", "reb_ast", "stocks"}
# STACKED fit, sharp (6-pick) read, run pv2 2026-11-19: const, log stored, (log stored)^2, distance, level, tier, rebounds, assists, threes, combo
COEF = {"goblin": [0.1629, 0.4040, -0.5178, 0.5156, -0.0533, -0.0042, 0.0833, 0.0861, 0.3101, -0.0215],
        "demon": [-0.0381, 1.1421, -0.0682, 0.0040, 0.0247, 0.0186, -0.1103, -0.1355, -0.1589, 0.0102]}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def season_of(d):
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def ladders(conn, season):
    H = {}
    for gd, pid, prop, lines, pm in conn.execute("SELECT game_date::text, player_id, prop, lines, p_more FROM nba_score.baseline_history_h WHERE season = %s", (season,)).fetchall():
        H[(gd, pid, prop)] = (np.asarray(lines, float), np.asarray(pm, float))
    return H


def attach(gd, pid, prop, line, over, H):
    out = np.full(len(gd), np.nan)
    for i, (k, ln, ov) in enumerate(zip(zip(gd, pid, prop), line, over)):
        h = H.get(k)
        if h is None:
            continue
        j = np.searchsorted(h[0], ln - 1e-6)
        if j < len(h[0]) and abs(h[0][j] - ln) < 1e-3:
            out[i] = h[1][j] if ov else 1 - h[1][j]
    return out


def write(conn, df, where, params):
    cols = ["app", "src", "season", "game_date", "player_id", "prop", "side", "line", "kind", "tier", "m", "hit", "ph", "p_stored"]
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score._lr_legs_h (app text, src text, season text, game_date date, player_id text, prop text, side text,
                       line float8, kind text, tier text, m float8, hit int, ph float8, p_stored float8)""")
        cur.execute("DELETE FROM nba_score._lr_legs_h WHERE " + where, params)
        with cur.copy("COPY nba_score._lr_legs_h (" + ", ".join(cols) + ") FROM STDIN") as cp:
            hi = cols.index("hit")
            for r in df[cols].itertuples(index=False):
                v_ = [None if (isinstance(v, float) and v != v) else v for v in r]; v_[hi] = int(v_[hi])
                cp.write_row(v_)
    conn.commit()


def main():
    global APP
    for APP in APPS:
        run_app()
    print("LH|DONE", flush=True)


def run_app():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    seasons = ["2024-25", "2025-26", "2026-27"]
    if APP == "prizepicks":
        ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
        box = defaultdict(dict)
        for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov
                FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01' AND min > 0""").fetchall():
            box[pid][str(d)] = tuple(float(v or 0) for v in (pts, reb, ast, fg3m, stl, blk, tov))
        rng = {"2024-25": ("2024-10-01", "2025-07-31"), "2025-26": ("2025-10-01", "2026-07-31"), "2026-27": ("2026-10-01", "2027-07-31")}
        for s in seasons:
            df = pd.read_sql("""SELECT game_date::text gd, nm, base_market, side, line::float8 line, kind, tier, anchor_line::float8 anchor_line, factor::float8 f_model
                                FROM nba_market.pp_leg_price WHERE snapshot_label = 'window' AND game_date BETWEEN %s AND %s AND game_date < current_date
                                  AND kind IN ('standard', 'goblin', 'demon') AND NOT coalesce(kind_position_mismatch, false) AND base_market = ANY(%s)""",
                             conn, params=(rng[s][0], rng[s][1], list(MK)))
            if not len(df):
                continue
            df = df.drop_duplicates(["gd", "nm", "base_market", "side", "line"])
            df["prop"] = df["base_market"].map(MK); df["player_id"] = df["nm"].map(ids)
            std = df[df["kind"] == "standard"].groupby(["gd", "nm", "base_market"])["line"].first().rename("std_line")
            df = df.join(std, on=["gd", "nm", "base_market"]); df["std_line"] = df["std_line"].fillna(df["anchor_line"])
            df["has_std"] = df.groupby(["gd", "nm", "base_market"])["kind"].transform(lambda x: (x == "standard").any())
            n0 = len(df); df = df[df["player_id"].notna()].copy()
            hit = np.full(len(df), np.nan)
            for i, (pid, gd, pr, ln, sd) in enumerate(zip(df["player_id"], df["gd"], df["prop"], df["line"], df["side"])):
                st = box.get(pid, {}).get(gd)
                if st is None:
                    continue
                v = STAT[pr](st)
                if v == ln:
                    continue
                hit[i] = float((v > ln) if sd.lower().startswith("o") else (v < ln))
            df["hit"] = hit; df = df[np.isfinite(hit)].copy()
            m = np.ones(len(df)); lfm = np.log(np.clip(df["f_model"].fillna(1.0).values, .05, 50)); sl = np.maximum(1.0, df["std_line"].fillna(df["line"]).values)
            rel = (df["line"].values - df["std_line"].fillna(df["line"]).values) / sl; lvl = np.log(sl); tr = df["tier"].fillna(0).astype(float).values
            for kd, b in COEF.items():
                k = (df["kind"] == kd).values
                x = b[0] + b[1] * lfm[k] + b[2] * lfm[k] ** 2 + b[3] * rel[k] + b[4] * lvl[k] + b[5] * tr[k]
                pr = df["prop"].values[k]
                for p_, c in GRPC.items():
                    x = x + b[c] * (pr == p_)
                x = x + b[9] * np.isin(pr, list(COMBO))
                m[k] = np.exp(x)
            df["m"] = m
            H = ladders(conn, s)
            over = df["side"].str.lower().str.startswith("o").values
            df["ph"] = attach(df["gd"].values, df["player_id"].values, df["prop"].values, df["line"].values, over, H); del H
            df["app"] = "prizepicks"; df["src"] = "real"; df["season"] = s; df["game_date"] = df["gd"]; df["p_stored"] = np.nan
            df["tier"] = df["tier"].fillna(0).astype(int).astype(str) + np.where(df["has_std"], "", "-ns")
            write(conn, df, "app = 'prizepicks' AND season = %s", (s,))
            log(f"prizepicks {s}: board rungs {n0:,}; graded {len(df):,} on {df['gd'].nunique()} slates; with honest probability {int(df['ph'].notna().sum()):,} "
                f"({100 * df['ph'].notna().mean():.0f}%); by kind {df['kind'].value_counts().to_dict()}; price median by kind {df.groupby('kind')['m'].median().round(3).to_dict()}")
    else:
        for s in seasons:
            df = pd.read_sql("""SELECT src, season, game_date, player player_id, prop, side, line, tier, kind, m, p p_stored, hit FROM nba_score._lr_app_legs
                                WHERE app = %s AND season = %s""", conn, params=(APP, s))
            if not len(df):
                continue
            if APP == "underdog":
                df["kind"] = df["tier"].str[:1]; df["m"] = df["m"] * 1.8708
            df["kind"] = df["kind"].replace("", "main")
            H = ladders(conn, s)
            over = df["side"].str.lower().str[0].isin(["o", "m", "h"]).values
            df["ph"] = attach(df["game_date"].astype(str).values, df["player_id"].astype(str).values, df["prop"].values, df["line"].astype(float).values, over, H); del H
            df["app"] = APP; df["line"] = df["line"].astype(float)
            write(conn, df, "app = %s AND season = %s", (APP, s))
            log(f"{APP} {s}: legs {len(df):,} on {df['game_date'].nunique()} slates; with honest probability {int(df['ph'].notna().sum()):,} ({100 * df['ph'].notna().mean():.0f}%); "
                f"by src {df['src'].value_counts().to_dict()}; by kind {df['kind'].value_counts().to_dict()}")
    conn.close()


if __name__ == "__main__":
    main()
