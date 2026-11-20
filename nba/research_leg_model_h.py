#!/usr/bin/env python3
"""
PHASE B1 - THE BEST HONEST PER-LEG PROBABILITY (NBA_HONEST_REBUILD.md section 8n / 8p). Owner D8: "be sure that the ROI and the hit rate are reliable.
It's the best that you can possibly get." Writes ONLY the scratch table nba_score._lr_legs_hp (LM_WRITE=1). Reads nothing from production scoring.
Every graded board leg of one app (regular AND alternates), honest inputs only, all known at pick time:
  model    ph (certified honest baseline, nba_score.baseline_history_h), its lean against the line, role, variance band, projected minutes, rank in slate
  price    the leg's own return multiplier (break-even 1 / multiplier), kind (regular / goblin / demon / alt)
  market   sportsbook de-vigged chance at the exact line and number of books; the sportsbooks' MAIN line for the player / prop and the app line's distance
           from it; the other app's regular line (unfiltered boards, rule C12)
  form     season and last-5 average against the line, hot / cold, games played, minutes trend, rest, home
  report   the injury report at pick time (own status, teammates' minutes out, fresh, questionable, opponent)
Walk-forward ONLY: each calendar month is predicted by models fitted on everything strictly before that month. Season weights (owner): the season being
predicted 1.0, the one before 0.6, two before 0.35.
Compared out of sample on the SAME legs:
  price    the app's own break-even (says nothing)            book     sportsbook chance at the exact line (where it exists)
  honest   ph alone                                           blend    logistic on [ph, book, price] (4 numbers)
  gbm      gradient boosting on every feature                 placebo  the same gbm with training results shuffled inside each slate
Reported per season and kind: log-loss, honesty slope (real on predicted), and the decisive table - the legs each number calls PROFITABLE (p x multiplier > 1,
and > 1.05): legs, slates, hit rate, real return with a 90% range re-drawing slates; plus the top 6 / 10 / 20 legs a slate by predicted return (one per player).
Env: DATABASE_URL, LM_APP (prizepicks | underdog | sleeper | fliff), LM_WRITE (0 | 1), LM_ROUNDS (300).
"""
import os
import subprocess
import sys
import time

import numpy as np
import pandas as pd
import psycopg

try:
    import lightgbm as lgb
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "lightgbm"], check=True)
    import lightgbm as lgb

APP = (os.environ.get("LM_APP") or "underdog").lower()
os.environ["CS_APP"] = "prizepicks" if APP == "prizepicks" else "underdog"
import research_cell_scan_honest as CS                      # noqa: E402  (injury_context, STATCOL, MKI)

WRITE = (os.environ.get("LM_WRITE") or "0") == "1"
ROUNDS = int(os.environ.get("LM_ROUNDS") or 300)
TRAIL = (os.environ.get("LM_TRAIL") or "0") == "1"
SEAS = ["2024-25", "2025-26", "2026-27"]
SW = {0: 1.0, 1: 0.6, 2: 0.35}
T0 = time.time()
rng = np.random.default_rng(53)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def load(conn):
    q = "SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, src, m::float8 m, hit::int hit, ph::float8 ph FROM nba_score._lr_legs_h WHERE app = %s AND hit IS NOT NULL AND m > 0"
    df = pd.read_sql(q, conn, params=(APP,))
    try:                                                     # pushed regular legs: scored out of sample, never trained on (hit stays empty)
        pu = pd.read_sql(q.replace("_lr_legs_h", "_lr_legs_push").replace("hit IS NOT NULL AND ", ""), conn, params=(APP,))
        if len(pu):
            df = pd.concat([df, pu], ignore_index=True); log(f"{APP}: + {len(pu):,} pushed regular legs (prediction only)")
    except Exception as ex:
        conn.rollback(); log(f"no pushed-leg table ({str(ex)[:80]})")
    if APP == "prizepicks":
        df = df[~df["tier"].astype(str).str.endswith("-u")].copy(); df["mm"] = df["m"] / 0.542
        df["kindc"] = df["kind"].map({"standard": 0, "goblin": 1, "demon": 2}).fillna(0).astype(int)
    else:
        df["mm"] = df["m"]; df["kindc"] = df["kind"].map({"R": 0, "F": 1, "B": 2, "main": 0, "alt": 3}).fillna(0).astype(int)
    df["under"] = ~df["side"].str.lower().str[0].isin(["o", "m", "h"]); sgn = np.where(df["under"], 1.0, -1.0); den = np.maximum(1.0, df["line"].values)
    log(f"{APP}: legs {len(df):,} on {df['gd'].nunique()} slates; by season {df.groupby('season').size().to_dict()}; by kind {df.groupby('kind').size().to_dict()}; by src {df.groupby('src').size().to_dict()}")
    hb = pd.read_sql("SELECT game_date::text gd, player_id, prop, anchor::float8 anchor, role_tier, var_band, proj_min::float8 proj_min FROM nba_score.baseline_history_h", conn)
    df = df.merge(hb.drop_duplicates(["gd", "player_id", "prop"]), on=["gd", "player_id", "prop"], how="left")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window'""", conn)
    inv = {v: k for k, v in CS.MKI.items()}; mc["prop"] = mc["market_key"].map(inv); mc["player_id"] = mc["nm"].map(ids)
    mc = mc[mc["prop"].notna() & mc["player_id"].notna()].drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    df = df.merge(mc, on=["gd", "player_id", "prop", "line"], how="left"); df["pb"] = np.where(df["under"], 1 - df["po"], df["po"])
    # the sportsbooks' MAIN line: most books, then closest to an even chance
    mm_ = mc.assign(d5=(mc["po"] - .5).abs()).sort_values(["books", "d5"], ascending=[False, True]).drop_duplicates(["gd", "player_id", "prop"])
    mm_ = mm_.rename(columns={"line": "bline", "po": "bpo", "books": "bbooks"})[["gd", "player_id", "prop", "bline", "bpo", "bbooks"]]
    df = df.merge(mm_, on=["gd", "player_id", "prop"], how="left")
    if APP == "prizepicks":
        ol = pd.read_sql("""SELECT DISTINCT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 oline FROM nba_market.board_snapshots
                            WHERE bookmaker = 'underdog' AND snapshot_label = 'window' AND market_key = ANY(%s)
                              AND coalesce(multiplier, round(((CASE WHEN price < 0 THEN 1 + 100.0 / (-price) ELSE 1 + price / 100.0 END) / sqrt(3))::numeric, 2)) = 1.0""",
                         conn, params=(list(CS.MKI.values()),))
        ol["prop"] = ol["market_key"].map(inv)
    else:
        ol = pd.read_sql("SELECT DISTINCT game_date::text gd, nm, base_market, line::float8 oline FROM nba_market.pp_leg_price WHERE snapshot_label = 'window' AND kind = 'standard'", conn)
        ol["prop"] = ol["base_market"].map(inv)
    ol["player_id"] = ol["nm"].map(ids); ol = ol[ol["player_id"].notna() & ol["prop"].notna()].drop_duplicates(["gd", "player_id", "prop"])[["gd", "player_id", "prop", "oline"]]
    df = df.merge(ol, on=["gd", "player_id", "prop"], how="left")
    gl = pd.read_sql("""SELECT nba_player_id::text player_id, game_date::text gd, season, matchup, team_id::text team_id, game_id::text game_id, min::float8 mn, pts::float8 pts, reb::float8 reb,
                               ast::float8 ast, fg3m::float8 fg3m, stl::float8 stl, blk::float8 blk, tov::float8 tov FROM nba_stats.player_game_log WHERE game_date >= '2024-10-01'""", conn)
    gl = gl.sort_values(["player_id", "gd"]).drop_duplicates(["player_id", "gd"]); gl["played"] = (gl["mn"] > 0).astype(int)
    g = gl.groupby(["player_id", "season"], sort=False)
    gl["gp"] = g["played"].cumsum() - gl["played"]
    gl["prev_gd"] = g["gd"].shift(1); gl["rest"] = (pd.to_datetime(gl["gd"]) - pd.to_datetime(gl["prev_gd"])).dt.days
    gl["mn_s"] = g["mn"].transform(lambda x: x.shift(1).expanding().mean()); gl["mn_5"] = g["mn"].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
    cols7 = ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov")
    for c in cols7:
        gl[c + "_s"] = g[c].transform(lambda x: x.shift(1).expanding().mean()); gl[c + "_5"] = g[c].transform(lambda x: x.shift(1).rolling(5, min_periods=3).mean())
        gl[c + "_sd"] = g[c].transform(lambda x: x.shift(1).expanding(min_periods=5).std())
    gl["home"] = (~gl["matchup"].fillna("").str.contains("@")).astype(float)
    INJ = CS.injury_context(conn, gl)
    df = df.merge(gl[["player_id", "gd", "gp", "rest", "mn_s", "mn_5", "home", "team_id", "game_id"] + [c + s for c in cols7 for s in ("_s", "_5", "_sd")]], on=["player_id", "gd"], how="left")
    avs = np.full(len(df), np.nan); av5 = np.full(len(df), np.nan); sds = np.full(len(df), np.nan)
    for pr, cols in CS.STATCOL.items():
        k = (df["prop"] == pr).values
        if k.any():
            avs[k] = sum(df.loc[k, c + "_s"].values for c in cols); av5[k] = sum(df.loc[k, c + "_5"].values for c in cols)
            sds[k] = np.sqrt(sum(df.loc[k, c + "_sd"].values ** 2 for c in cols))
    X = pd.DataFrame(index=df.index)
    X["ph"] = df["ph"]; X["under"] = df["under"].astype(float); X["line"] = df["line"]; X["be"] = 1 / df["mm"]; X["kind"] = df["kindc"]
    X["prop"] = df["prop"].astype("category").cat.codes
    X["lean"] = sgn * (df["line"] - df["anchor"]) / den
    X["role"] = df["role_tier"].astype("category").cat.codes.replace(-1, np.nan); X["band"] = df["var_band"].astype("category").cat.codes.replace(-1, np.nan)
    X["proj_min"] = df["proj_min"]
    X["ph_rank"] = df.groupby(["gd", "under"])["ph"].rank(pct=True)
    X["ph_ret"] = df["ph"] * df["mm"] - 1
    X["pb"] = df["pb"]; X["books"] = df["books"]; X["pb_ret"] = df["pb"] * df["mm"] - 1
    X["bline_d"] = sgn * (df["line"] - df["bline"]) / den; X["bpo_side"] = np.where(df["under"], 1 - df["bpo"], df["bpo"]); X["bbooks"] = df["bbooks"]
    X["oline_d"] = sgn * (df["line"] - df["oline"])
    X["avs_d"] = sgn * (df["line"] - avs) / den; X["av5_d"] = sgn * (df["line"] - av5) / den; X["hot"] = (av5 - avs) / np.maximum(1.0, avs)
    X["avs_z"] = sgn * (df["line"] - avs) / np.maximum(0.5, sds)
    X["gp"] = df["gp"]; X["mn_trend"] = df["mn_5"] - df["mn_s"]; X["mn_s"] = df["mn_s"]; X["rest"] = df["rest"].clip(upper=10); X["home"] = df["home"]
    X["month"] = df["gd"].str[5:7].astype(int).map(lambda m: (m - 10) % 12); X["dow"] = pd.to_datetime(df["gd"]).dt.dayofweek
    X["n_player_legs"] = df.groupby(["gd", "player_id"])["hit"].transform("size")
    if INJ is not None:
        own, team = INJ
        df = df.merge(own, on=["gd", "player_id"], how="left").merge(team, on=["gd", "team_id"], how="left")
        opp = team.rename(columns={"team_id": "opp_id", "min_out": "opp_out", "min_fresh": "opp_fresh", "min_q": "opp_q"})
        gt = gl[["gd", "game_id", "team_id"]].drop_duplicates(); gt = gt.merge(gt, on=["gd", "game_id"], suffixes=("", "_o")); gt = gt[gt["team_id"] != gt["team_id_o"]]
        gt = gt.rename(columns={"team_id_o": "opp_id"}).drop_duplicates(["gd", "game_id", "team_id"])
        df = df.merge(gt, on=["gd", "game_id", "team_id"], how="left").merge(opp, on=["gd", "opp_id"], how="left")
        has = df["team_id"].notna().values
        X = X.reset_index(drop=True); df = df.reset_index(drop=True)
        for c in ("min_out", "min_fresh", "min_q", "opp_out", "opp_fresh"):
            X[c] = np.where(has, df[c].fillna(0.0), np.nan)
        st = df["own_status"].fillna("not listed").str.lower()
        X["own_status"] = np.where(has, np.select([st.str.contains("out"), st.str.contains("doubt"), st.str.contains("quest"), st.str.contains("prob")], [4, 3, 2, 1], 0), np.nan)
    df = df.reset_index(drop=True); X = X.reset_index(drop=True)
    # TRAILING LAYERS (strictly earlier slates): how the player's own regular legs of this prop and side have resolved, and how the app's regular legs of
    # this prop and side have resolved lately (the documentation's "trailing" and "ranking" layers, rebuilt on honest results).
    reg = df[df["kindc"] == 0].drop_duplicates(["gd", "player_id", "prop", "under"])[["gd", "player_id", "prop", "under", "hit"]].sort_values("gd")
    gp_ = reg.groupby(["player_id", "prop", "under"], sort=False)["hit"]
    reg["tr_pl10"] = gp_.transform(lambda x: x.shift(1).rolling(10, min_periods=4).mean()); reg["tr_pl_n"] = gp_.cumcount()
    pl = reg.groupby(["gd", "player_id", "under"], as_index=False)["hit"].mean().sort_values("gd")
    pl["tr_plall10"] = pl.groupby(["player_id", "under"], sort=False)["hit"].transform(lambda x: x.shift(1).rolling(10, min_periods=4).mean())
    sl = reg.groupby(["gd", "prop", "under"], as_index=False)["hit"].mean().sort_values("gd")
    gs = sl.groupby(["prop", "under"], sort=False)["hit"]
    sl["tr_slate7"] = gs.transform(lambda x: x.shift(1).rolling(7, min_periods=3).mean()); sl["tr_slate21"] = gs.transform(lambda x: x.shift(1).rolling(21, min_periods=7).mean())
    t = df[["gd", "player_id", "prop", "under"]].merge(reg.drop(columns=["hit"]), on=["gd", "player_id", "prop", "under"], how="left")
    t = t.merge(pl.drop(columns=["hit"]), on=["gd", "player_id", "under"], how="left").merge(sl.drop(columns=["hit"]), on=["gd", "prop", "under"], how="left")
    # legs of a player / prop / side with no regular leg that day stay empty on the player layers (the trees handle missing)
    if TRAIL:                                               # run lm3: the trees give these layers weight and get WORSE out of sample -> off by default
        for c in ("tr_pl10", "tr_pl_n", "tr_plall10", "tr_slate7", "tr_slate21"):
            X[c] = t[c].values
    X = X.astype("float32")
    return df, X


def logloss(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4); return float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())


def boot(r, gd, n=300):
    u, inv = np.unique(gd, return_inverse=True)
    if len(u) < 5:
        return np.nan, np.nan
    s = np.bincount(inv, weights=r, minlength=len(u)); c = np.bincount(inv, minlength=len(u)); ix = rng.integers(len(u), size=(n, len(u)))
    b = s[ix].sum(1) / np.maximum(1, c[ix].sum(1)); return float(np.quantile(b, .05)), float(np.quantile(b, .95))


def fit_blend(Z, y, w):
    Z = np.c_[np.ones(len(Z)), Z]; b = np.zeros(Z.shape[1])
    for _ in range(30):
        p = 1 / (1 + np.exp(-(Z @ b))); ww = w * (p * (1 - p) + 1e-9)
        H = (Z.T * ww) @ Z + 1e-3 * np.eye(Z.shape[1]); st = np.linalg.solve(H, Z.T @ (w * (y - p))); b += st
        if np.abs(st).max() < 1e-7:
            break
    return b


def lg(p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df, X = load(conn); conn.close()
    y = df["hit"].values.astype(float); mm = df["mm"].values; ym = df["gd"].str[:7].values; sidx = df["season"].map({s: i for i, s in enumerate(SEAS)}).values
    feats = list(X.columns); cat = ["prop", "kind"]
    log(f"features {len(feats)}: {feats}")
    log("coverage: " + ", ".join(f"{c} {100 * X[c].notna().mean():.0f}%" for c in ("ph", "pb", "bline_d", "oline_d", "avs_d", "min_out") if c in X))
    P = {k: np.full(len(df), np.nan) for k in ("blend", "gbm", "gbm_s", "placebo")}
    months = sorted(set(ym)); imp = np.zeros(len(feats)); nfit = 0
    Zall = np.c_[lg(np.nan_to_num(X["ph"].values, nan=.5)), np.isnan(X["ph"].values), lg(np.nan_to_num(X["pb"].values, nan=.5)), np.isnan(X["pb"].values), lg(X["be"].values), X["under"].values]
    for mth in months:
        tr = (ym < mth) & ~np.isnan(y); te = ym == mth
        if tr.sum() < 60000 or len(set(df["gd"].values[tr])) < 20:
            continue
        cur = sidx[te][0]; w = np.array([SW.get(int(cur - s), 0.35) for s in sidx[tr]])
        b = fit_blend(Zall[tr], y[tr], w); P["blend"][te] = 1 / (1 + np.exp(-(np.c_[np.ones(te.sum()), Zall[te]] @ b)))
        par = dict(objective="binary", learning_rate=0.05, num_leaves=31, min_data_in_leaf=400, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1, num_threads=4, seed=7)
        # the app's own price is the starting point (init score = log-odds of the break-even): the trees learn only the DEVIATION from the price, so a
        # multiplier never seen in training (this season's deeper demons) starts from its own break-even instead of an extrapolated guess.
        off = lg(X["be"].values.astype(float))
        ds = lgb.Dataset(X[tr], label=y[tr], weight=w, categorical_feature=cat, free_raw_data=False, init_score=off[tr])
        m_ = lgb.train(par, ds, num_boost_round=ROUNDS); P["gbm"][te] = 1 / (1 + np.exp(-(m_.predict(X[te], raw_score=True) + off[te]))); imp += m_.feature_importance("gain"); nfit += 1
        # a small, heavily regularised version (7 leaves, 2,000 legs a leaf): less able to chase noise
        par_s = dict(par, num_leaves=7, min_data_in_leaf=2000, lambda_l2=20.0)
        ms_ = lgb.train(par_s, lgb.Dataset(X[tr], label=y[tr], weight=w, categorical_feature=cat, init_score=off[tr]), num_boost_round=max(100, ROUNDS // 2))
        P["gbm_s"][te] = 1 / (1 + np.exp(-(ms_.predict(X[te], raw_score=True) + off[te])))
        ysh = pd.Series(y[tr]).groupby(df["gd"].values[tr]).transform(lambda v: rng.permutation(v.values)).values
        mp = lgb.train(par, lgb.Dataset(X[tr], label=ysh, weight=w, categorical_feature=cat, init_score=off[tr]), num_boost_round=ROUNDS)
        P["placebo"][te] = 1 / (1 + np.exp(-(mp.predict(X[te], raw_score=True) + off[te])))
        log(f"month {mth}: train {int(tr.sum()):,} legs, test {int(te.sum()):,}; blend weights [const, ph, ph missing, book, book missing, price, under] = {np.round(b, 3).tolist()}")
    P["price"] = 1 / mm; P["honest"] = df["ph"].values; P["book"] = df["pb"].values
    P["mix"] = 1 / (1 + np.exp(-(0.5 * lg(P["blend"]) + 0.5 * lg(P["gbm"]))))        # half blend, half gbm (log-odds)
    ok_all = ~np.isnan(P["gbm"]); ok = ok_all & ~np.isnan(y)
    log(f"out-of-sample legs {int(ok.sum()):,} of {len(df):,}; models fitted {nfit}")
    order = np.argsort(-imp); print("LM|feature weight in the gbm (gain share): " + ", ".join(f"{feats[i]} {100 * imp[i] / imp.sum():.1f}%" for i in order[:18]), flush=True)
    KN = {0: "regular", 1: "goblin", 2: "demon", 3: "alt"}
    df["kn"] = df["kindc"].map(KN)
    for s in SEAS:
        for kn in ["ALL"] + sorted(df["kn"].unique()):
            k = ok & (df["season"].values == s) & ((df["kn"].values == kn) | (kn == "ALL"))
            if k.sum() < 3000:
                continue
            gd = df["gd"].values[k]; yy = y[k]; m_k = mm[k]; r = yy * m_k - 1
            print(f"\nLM|=== {APP} {s} {kn}: legs {int(k.sum()):,} on {len(set(gd))} slates; hit {yy.mean():.3f}; return of every leg {100 * r.mean():+.1f}%; price source {df['src'][k].value_counts().to_dict()} ===", flush=True)
            for nm in ("price", "book", "honest", "blend", "gbm", "gbm_s", "mix", "placebo"):
                p = P[nm][k]; v = ~np.isnan(p)
                if v.sum() < 1000:
                    continue
                sl = np.polyfit(p[v], yy[v], 1)[0] if np.std(p[v]) > 1e-6 else np.nan
                out = [f"LM|  {nm:8s} cover {100 * v.mean():3.0f}% log-loss {logloss(p[v], yy[v]):.4f} (price on the same legs {logloss(1 / m_k[v], yy[v]):.4f}) slope {sl:.2f}"]
                for thr in (0.0, 0.05, 0.10):
                    sel = v & (np.nan_to_num(p) * m_k - 1 > thr)
                    if sel.sum() >= 50:
                        lo, hi = boot(r[sel], gd[sel])
                        out.append(f"says > {int(100 * thr):+d}%: n {int(sel.sum()):,} / {len(set(gd[sel]))} slates, says {100 * (p[sel] * m_k[sel] - 1).mean():+.1f}%, hit {yy[sel].mean():.3f}, REAL {100 * r[sel].mean():+.1f}% [{100 * lo:+.1f} .. {100 * hi:+.1f}]")
                print(" | ".join(out), flush=True)
            for nm in ("honest", "blend", "gbm", "gbm_s", "mix", "placebo"):
                p = P[nm][k]; t = pd.DataFrame({"gd": gd, "pl": df["player_id"].values[k], "ev": p * m_k - 1, "r": r, "h": yy})
                t = t[t["ev"].notna()].sort_values("ev", ascending=False).drop_duplicates(["gd", "pl"])
                out = []
                for K in (6, 10, 20):
                    tt = t.groupby("gd").head(K); lo, hi = boot(tt["r"].values, tt["gd"].values)
                    out.append(f"top {K}: hit {tt['h'].mean():.3f} REAL {100 * tt['r'].mean():+.1f}% [{100 * lo:+.1f} .. {100 * hi:+.1f}] n{len(tt):,}")
                print(f"LM|  {nm:8s} best a slate by predicted return, one per player: " + " | ".join(out), flush=True)
    if WRITE:
        conn = psycopg.connect(os.environ["DATABASE_URL"])
        conn.execute("""CREATE TABLE IF NOT EXISTS nba_score._lr_legs_hp (app text, game_date date, player_id text, prop text, side text, line float8, kind text, tier text,
                        p_blend float4, p_gbm float4, p_placebo float4, built_at timestamptz DEFAULT now())""")
        conn.execute("ALTER TABLE nba_score._lr_legs_hp ADD COLUMN IF NOT EXISTS p_gbm_s float4")
        conn.execute("DELETE FROM nba_score._lr_legs_hp WHERE app = %s", (APP,))
        with conn.cursor() as cur:
            with cur.copy("COPY nba_score._lr_legs_hp (app, game_date, player_id, prop, side, line, kind, tier, p_blend, p_gbm, p_placebo, p_gbm_s) FROM STDIN") as cp:
                for i in np.where(ok_all)[0]:
                    cp.write_row((APP, df["gd"].values[i], df["player_id"].values[i], df["prop"].values[i], df["side"].values[i], float(df["line"].values[i]), df["kind"].values[i],
                                  df["tier"].values[i], float(P["blend"][i]), float(P["gbm"][i]), float(P["placebo"][i]), float(P["gbm_s"][i])))
        conn.execute("CREATE INDEX IF NOT EXISTS _lr_legs_hp_i ON nba_score._lr_legs_hp (app, game_date, player_id, prop)")
        conn.commit(); conn.close(); log(f"wrote {int(ok_all.sum()):,} rows to nba_score._lr_legs_hp")
    print("LM|DONE", flush=True)


if __name__ == "__main__":
    main()
