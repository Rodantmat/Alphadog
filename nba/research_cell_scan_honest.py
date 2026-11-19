#!/usr/bin/env python3
"""
S6c - HONEST CELL SCAN: where do REGULAR legs beat their break-even in ALL THREE seasons? READ-ONLY. (NBA_HONEST_REBUILD.md section 8h)
After S5 (no general edge) and the Underdog regular-Under lead (8g), this scans every pre-game describable cell of regular legs with honest inputs only.
Apps: Underdog regular (1.0x) legs, real board, break-even 0.5345 (2-pick Power) ; PrizePicks regular lines, break-even 0.542 (5 / 6-pick Flex).
Features (all known before the game):
  board     prop, side, line size, month phase, weekday
  honest model (baseline_history_h)   probability of the side (ph) in tenths WITHIN the slate, model lean = (anchor - line) / max(1, line), role tier,
            variance band, projected minutes
  market    sportsbook chance of the side at the exact line (when a book has it), number of books; the OTHER app's line for the same player / prop
  form      (player game log, strictly earlier games of the season) season average and last-5 average of the stat against the line, games played,
            minutes last 5 against season, days of rest, home / away
A cell = one feature bucket x side (single), and pairs of the strongest single features x side (double). A cell is KEPT only if in EACH of the three
seasons it has >= CS_MIN legs and its hit rate is above break-even, and the pooled lower 90% bound (re-drawing slates) is above break-even.
Kept cells are printed with per-season legs / hit, pooled return and legs a slate; then the count of cells scanned, so the reader can judge how many
would pass by luck (the script also runs the SAME scan on a shuffled-result copy and prints how many cells that keeps = the false-positive yardstick).
Env: DATABASE_URL, CS_APP (underdog | prizepicks), CS_MIN (150 legs per season; this season CS_MIN3 = 60).
"""
import os
from itertools import combinations

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("CS_APP") or "underdog").lower()
MINL = int(os.environ.get("CS_MIN") or 150); MIN3 = int(os.environ.get("CS_MIN3") or 60)
BE = 0.5345 if APP == "underdog" else 0.542
STATCOL = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "steals": ["stl"], "blocks": ["blk"], "turnovers": ["tov"],
           "stocks": ["stl", "blk"], "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "pra": ["pts", "reb", "ast"]}
MKI = {"points": "player_points", "rebounds": "player_rebounds", "assists": "player_assists", "threes_made": "player_threes", "steals": "player_steals",
       "blocks": "player_blocks", "turnovers": "player_turnovers", "stocks": "player_blocks_steals", "pts_reb": "player_points_rebounds",
       "pts_ast": "player_points_assists", "reb_ast": "player_rebounds_assists", "pra": "player_points_rebounds_assists"}
rng = np.random.default_rng(29)
SEAS = ["2024-25", "2025-26", "2026-27"]


def bucket(x, edges, labels):
    return pd.cut(x, edges, labels=labels).astype(object)


def load(conn):
    kind = "R" if APP == "underdog" else "standard"
    df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, hit::int hit, ph::float8 ph FROM nba_score._lr_legs_h
                        WHERE app = %s AND kind = %s AND hit IS NOT NULL""" + (" AND m BETWEEN 1.86 AND 1.88" if APP == "underdog" else " AND tier NOT LIKE '%%-u'"),
                     conn, params=(APP, kind))
    df = df[df["prop"].isin(STATCOL)].copy(); df["under"] = ~df["side"].str.lower().str[0].isin(["o", "m", "h"]); df["sd"] = np.where(df["under"], "Under", "Over")
    # honest model context
    hb = pd.read_sql("SELECT game_date::text gd, player_id, prop, anchor::float8 anchor, role_tier, var_band, proj_min::float8 proj_min FROM nba_score.baseline_history_h", conn)
    df = df.merge(hb.drop_duplicates(["gd", "player_id", "prop"]), on=["gd", "player_id", "prop"], how="left")
    # sportsbook at the exact line
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window'""", conn)
    inv = {v: k for k, v in MKI.items()}; mc["prop"] = mc["market_key"].map(inv); mc["player_id"] = mc["nm"].map(ids)
    mc = mc[mc["prop"].notna() & mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    df = df.merge(mc, on=["gd", "player_id", "prop", "line"], how="left"); df["pb"] = np.where(df["under"], 1 - df["po"], df["po"])
    # the other app's regular line
    other = "prizepicks" if APP == "underdog" else "underdog"
    ol = pd.read_sql("SELECT DISTINCT game_date::text gd, player_id, prop, line::float8 oline FROM nba_score._lr_legs_h WHERE app = %s AND kind = %s",
                     conn, params=(other, "standard" if other == "prizepicks" else "R")).drop_duplicates(["gd", "player_id", "prop"])
    df = df.merge(ol, on=["gd", "player_id", "prop"], how="left")
    # form from the game log (strictly earlier games of the same season)
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, season, matchup, min::float8 mn, pts::float8 pts, reb::float8 reb, ast::float8 ast, fg3m::float8 fg3m,
                               stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn)
    gl = gl.sort_values(["player_id", "gd"]).drop_duplicates(["player_id", "gd"]); gl["played"] = (gl["mn"] > 0).astype(int)
    g = gl.groupby(["player_id", "season"], sort=False)
    gl["gp"] = g["played"].cumsum() - gl["played"]
    gl["prev_gd"] = g["gd"].shift(1); gl["rest"] = (pd.to_datetime(gl["gd"]) - pd.to_datetime(gl["prev_gd"])).dt.days
    gl["mn_s"] = g["mn"].transform(lambda x: x.shift(1).expanding().mean()); gl["mn_5"] = g["mn"].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    for c in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov"):
        gl[c + "_s"] = g[c].transform(lambda x: x.shift(1).expanding().mean()); gl[c + "_5"] = g[c].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    gl["home"] = ~gl["matchup"].fillna("").str.contains("@")
    df = df.merge(gl[["player_id", "gd", "gp", "rest", "mn_s", "mn_5", "home"] + [c + s for c in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov") for s in ("_s", "_5")]],
                  on=["player_id", "gd"], how="left")
    avs = np.full(len(df), np.nan); av5 = np.full(len(df), np.nan)
    for pr, cols in STATCOL.items():
        k = (df["prop"] == pr).values
        avs[k] = sum(df.loc[k, c + "_s"].values for c in cols); av5[k] = sum(df.loc[k, c + "_5"].values for c in cols)
    den = np.maximum(1.0, df["line"].values)
    sgn = np.where(df["under"], 1.0, -1.0)                   # every "lean" is signed so that POSITIVE = favours the leg's own side
    F = pd.DataFrame(index=df.index)
    F["prop"] = df["prop"]
    F["line size"] = bucket(df["line"], [0, 1, 2.6, 5.6, 9.6, 14.6, 19.6, 26, 99], ["0.5", "1.5-2.5", "3-5.5", "6-9.5", "10-14.5", "15-19.5", "20-25.5", "26+"])
    F["phase"] = df["gd"].str[5:7].map(lambda m: "Oct-Nov" if m in ("10", "11") else "Dec-Jan" if m in ("12", "01") else "Feb+")
    F["weekday"] = pd.to_datetime(df["gd"]).dt.day_name().str[:3]
    r = df.groupby(["gd", "sd"])["ph"].rank(pct=True)
    F["model rank in slate"] = bucket(r, [0, .2, .4, .6, .8, .9, .95, 1.0001], ["0-20%", "20-40%", "40-60%", "60-80%", "80-90%", "90-95%", "top 5%"])
    F["model chance"] = bucket(df["ph"], [0, .35, .45, .5, .55, .6, .65, .7, .8, 1.01], ["<.35", ".35-.45", ".45-.50", ".50-.55", ".55-.60", ".60-.65", ".65-.70", ".70-.80", ".80+"])
    F["model lean"] = bucket(sgn * (df["line"] - df["anchor"]) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["role"] = df["role_tier"]; F["variance band"] = df["var_band"]
    F["projected minutes"] = bucket(df["proj_min"], [0, 18, 24, 28, 32, 35, 99], ["<18", "18-24", "24-28", "28-32", "32-35", "35+"])
    F["book chance"] = bucket(df["pb"], [0, .45, .48, .5, .52, .54, .56, .6, 1.01], ["<.45", ".45-.48", ".48-.50", ".50-.52", ".52-.54", ".54-.56", ".56-.60", ".60+"])
    F["books"] = np.where(df["books"].isna(), "none", np.where(df["books"] >= 2, "2+", "1"))
    F["other app line"] = bucket(sgn * (df["line"] - df["oline"]), [-99, -.99, -.01, .01, .99, 99], ["worse by 1+", "worse by .5", "same", "better by .5", "better by 1+"])
    F["season avg vs line"] = bucket(sgn * (df["line"] - avs) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["last 5 vs line"] = bucket(sgn * (df["line"] - av5) / den, [-9, -.3, -.15, -.05, .05, .15, .3, 9], ["against 30%+", "against 15-30%", "against 5-15%", "level", "for 5-15%", "for 15-30%", "for 30%+"])
    F["last 5 vs season"] = bucket((av5 - avs) / np.maximum(1.0, avs), [-9, -.25, -.1, .1, .25, 9], ["cold 25%+", "cold 10-25%", "level", "hot 10-25%", "hot 25%+"])
    F["games played"] = bucket(df["gp"], [-1, 2, 5, 10, 20, 40, 200], ["0-2", "3-5", "6-10", "11-20", "21-40", "41+"])
    F["minutes trend"] = bucket(df["mn_5"] - df["mn_s"], [-99, -4, -1.5, 1.5, 4, 99], ["down 4+", "down 1.5-4", "level", "up 1.5-4", "up 4+"])
    F["rest days"] = bucket(df["rest"], [0, 1, 2, 3, 6, 400], ["back-to-back", "1 day", "2 days", "3-5 days", "6+"])
    F["home"] = np.where(df["home"].isna(), None, np.where(df["home"].fillna(False), "home", "away"))
    return df, F


def scan(df, F, hitcol, label, verbose=True):
    """returns kept cells; prints when verbose"""
    kept = []; scanned = 0
    seas = df["season"].values; hit = df[hitcol].values.astype(float); sd = df["sd"].values; gd = df["gd"].values
    nsl = {s: df.loc[df["season"] == s, "gd"].nunique() for s in SEAS}

    def test(mask, name):
        nonlocal scanned
        scanned += 1
        st = []
        for s in SEAS:
            k = mask & (seas == s); n = int(k.sum())
            if n < (MIN3 if s == SEAS[-1] else MINL):
                return
            h = hit[k].mean()
            if h <= BE:
                return
            st.append((n, h))
        hh = hit[mask]; dd = gd[mask]; u = np.unique(dd); by = {d: hh[dd == d] for d in u}
        bs = [np.concatenate([by[d] for d in rng.choice(u, len(u))]).mean() for _ in range(200)]
        lo = float(np.quantile(bs, .05))
        if lo > BE:
            kept.append((hh.mean(), lo, name, st, int(mask.sum()), sum(n / nsl[s] for (n, _), s in zip(st, SEAS)) / 3))

    cols = list(F.columns); vals = {c: F[c].values for c in cols}
    for side in ("Under", "Over"):
        sm = sd == side
        test(sm, f"{side} | all")
        for c in cols:
            for v in pd.unique(F[c].dropna()):
                test(sm & (vals[c] == v), f"{side} | {c} = {v}")
        for c1, c2 in combinations(cols, 2):
            a = vals[c1]; b = vals[c2]
            for v1 in pd.unique(F[c1].dropna()):
                m1 = sm & (a == v1)
                if m1.sum() < 2 * MINL + MIN3:
                    continue
                for v2 in pd.unique(F[c2].dropna()):
                    test(m1 & (b == v2), f"{side} | {c1} = {v1} & {c2} = {v2}")
    if verbose:
        print(f"CS|{label}: cells scanned {scanned:,}; KEPT {len(kept)} (each season above {BE} with enough legs, pooled lower 90% bound above {BE})", flush=True)
        for h, lo, name, st, n, per in sorted(kept, key=lambda x: -x[1])[:70]:
            print(f"CS|  {name:86s} legs {n:6,} ({per:5.1f} a slate) hit {h:.3f} (low {lo:.3f}) return {100 * (h / BE - 1):+5.1f}% | " +
                  " / ".join(f"{s[2:]} {x[1]:.3f} n{x[0]:,}" for x, s in zip(st, SEAS)), flush=True)
    return kept, scanned


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df, F = load(conn); conn.close()
    print(f"CS|{APP}: regular legs {len(df):,} on {df['gd'].nunique()} slates; hit Under {df[df['under']]['hit'].mean():.3f} Over {df[~df['under']]['hit'].mean():.3f}; break-even {BE}; "
          f"features {len(F.columns)}; coverage: model {100 * df['ph'].notna().mean():.0f}%, book {100 * df['pb'].notna().mean():.0f}%, other app {100 * df['oline'].notna().mean():.0f}%, form {100 * df['gp'].notna().mean():.0f}%", flush=True)
    print("CS|single features, hit rate by season (Under | Over):", flush=True)
    for c in F.columns:
        for v in sorted(pd.unique(F[c].dropna()), key=str):
            cells = []
            for side in ("Under", "Over"):
                parts = []
                for s in SEAS:
                    k = (F[c].values == v) & (df["sd"].values == side) & (df["season"].values == s)
                    parts.append(f"{df['hit'].values[k].mean():.3f} n{int(k.sum()):,}" if k.sum() >= 40 else "-")
                cells.append(" / ".join(parts))
            print(f"CS|  {c:20s} {str(v):16s} Under {cells[0]:48s} | Over {cells[1]}", flush=True)
    kept, scanned = scan(df, F, "hit", "REAL results")
    # false-positive yardstick: shuffle results inside each slate x side (keeps every slate's hit rate, destroys every link to the features)
    fp = []
    for i in range(3):
        d2 = df.copy(); d2["hs"] = d2.groupby(["gd", "sd"])["hit"].transform(lambda x: rng.permutation(x.values))
        k2, _ = scan(d2, F, "hs", "shuffled", verbose=False); fp.append(len(k2))
    print(f"CS|false-positive yardstick: the same scan on results shuffled inside each slate keeps {fp} cells (3 shuffles) against {len(kept)} on the real results", flush=True)
    print("CS|DONE", flush=True)


if __name__ == "__main__":
    main()
