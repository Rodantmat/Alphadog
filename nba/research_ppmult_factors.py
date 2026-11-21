#!/usr/bin/env python3
"""
PP MULTIPLIER FACTORS - WHAT SETS A GOBLIN / DEMON LEG'S MULTIPLIER. READ-ONLY. (owner 2026-11-20 17:08 PT)
Target: the leg's real multiplier = its 2-pick factor f (2-pick Power = 3 x f; partner-invariant, time-specific - 8ap).
Every real quote (nba_market.pp_mined_leg) joined to the system's parsed ladder (nba_market.pp_leg_price: anchor line, regular vs switch point,
tier) and enriched with every candidate factor the owner named and more:
  tier / rung (1 = nearest the anchor), kind, side, prop
  where the anchor sits (anchor level), the line's distance from it (units, relative, steps, in the player's own standard deviations)
  regular line present (explicit) vs switch point only
  ladder shape: number of goblin / demon rungs on that side, the line step, rung position
  player form: season / last-10 / last-5 average and spread of that stat, games played, minutes, share of games over this exact line
  the sportsbooks' chance of this exact line where one exists; minutes before tip; time of day
Prints (A) controlled tables factor by factor (others held fixed), (B) out-of-day accuracy as factors are added (gradient boosting),
(C) a mechanistic test: one curve of ln f against z = (line - centre) / spread, centre / spread from PrizePicks' anchor and the player's form.
Env: DATABASE_URL, PPMF_SINCE (2026-10-20).
"""
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import psycopg

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=False)
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402

STAT = {"player_points": ["pts"], "player_rebounds": ["reb"], "player_assists": ["ast"], "player_threes": ["fg3m"], "player_steals": ["stl"], "player_blocks": ["blk"],
        "player_turnovers": ["tov"], "player_points_rebounds_assists": ["pts", "reb", "ast"], "player_points_rebounds": ["pts", "reb"], "player_points_assists": ["pts", "ast"],
        "player_rebounds_assists": ["reb", "ast"], "player_blocks_steals": ["blk", "stl"], "player_oreb": ["oreb"], "player_dreb": ["dreb"], "player_fgm": ["fgm"], "player_fga": ["fga"],
        "player_ftm": ["ftm"], "player_fg3a": ["fg3a"], "player_fta": ["fta"]}
MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks", "player_turnovers": "turnovers",
      "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast", "player_rebounds_assists": "reb_ast"}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPMF_SINCE", "2026-10-20")
    m = pd.read_sql("""SELECT (quoted_at AT TIME ZONE 'America/Los_Angeles')::date gd, quoted_at, projection_id::text pid, player, nba_ref.norm_name(player) nm, base_market,
                              line::float8 line, std_line::float8 std_line, kind, lower(left(side,1)) sd, factor_mined::float8 f
                       FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon') AND quoted_at >= %s""", conn, params=(since,))
    lp = pd.read_sql("""SELECT DISTINCT game_date gd, nba_ref.norm_name(player) nm, base_market, lower(left(side,1)) sd, line::float8 line, kind, anchor_line::float8 anchor, anchor_type, tier::int tier
                        FROM nba_market.pp_leg_price WHERE game_date >= %s AND player NOT LIKE '%%+%%'""", conn, params=(since,))
    st = pd.read_sql("SELECT DISTINCT ON (projection_id) projection_id::text pid, start_time FROM nba_market.pp_board_row WHERE start_time IS NOT NULL ORDER BY projection_id, run_file DESC", conn)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date, min::float8 mn, pts, reb, ast, fg3m, stl, blk, tov, oreb, dreb, fgm, fga, ftm, fg3a, fta FROM nba_stats.player_game_log WHERE game_date >= '2025-10-01'", conn)
    bk = pd.read_sql("SELECT game_date gd, player_id::text player_id, prop, lower(left(side,1)) sd, line::float8 line, market_hp::float8 pbook FROM nba_score.board_true_hp WHERE game_date >= %s AND market_hp IS NOT NULL", conn, params=(since,))
    conn.close()
    print(f"PMF|quotes {len(m):,} | ladder rows {len(lp):,} | game logs {len(gl):,} | book lines {len(bk):,}", flush=True)
    m["gd"] = pd.to_datetime(m["gd"]); lp["gd"] = pd.to_datetime(lp["gd"]); bk["gd"] = pd.to_datetime(bk["gd"]); gl["game_date"] = pd.to_datetime(gl["game_date"])
    # ladder shape per side
    lad = lp.groupby(["gd", "nm", "base_market", "sd"]).agg(n_gob=("kind", lambda s: (s == "goblin").sum()), n_dem=("kind", lambda s: (s == "demon").sum()),
                                                           has_std=("kind", lambda s: (s == "standard").any())).reset_index()
    lp2 = lp[(lp["kind"] != "standard") & lp["anchor"].notna()].copy()
    lp2["dist"] = (lp2["line"] - lp2["anchor"]).abs()
    lp2["rung"] = lp2.groupby(["gd", "nm", "base_market", "sd", "kind"])["dist"].rank(method="first")
    stepd = lp.groupby(["gd", "nm", "base_market", "sd"])["line"].apply(lambda s: np.min(np.diff(np.sort(s.unique()))) if s.nunique() > 1 else np.nan).rename("lstep").reset_index()
    d = m.merge(lp2[["gd", "nm", "base_market", "sd", "line", "kind", "anchor", "anchor_type", "tier", "rung"]].drop_duplicates(["gd", "nm", "base_market", "sd", "line", "kind"]),
                on=["gd", "nm", "base_market", "sd", "line", "kind"], how="inner")
    d = d.merge(lad, on=["gd", "nm", "base_market", "sd"], how="left").merge(stepd, on=["gd", "nm", "base_market", "sd"], how="left").merge(st, on="pid", how="left")
    print(f"PMF|quotes joined to the parsed ladder: {len(d):,} ({100*len(d)/max(1,len(m)):.0f}%)", flush=True)
    d["player_id"] = d["nm"].map(ids)
    # form features from game logs strictly before the game date
    gl = gl.sort_values("game_date")
    feats = []
    for (pid_, bm), g in d.groupby(["player_id", "base_market"]):
        cols = STAT.get(bm)
        if pid_ is None or cols is None:
            continue
        h = gl[gl["player_id"] == pid_]
        if h.empty:
            continue
        v = h[cols].sum(axis=1).values; dates = h["game_date"].values; mins = h["mn"].values
        for gd_, gg in g.groupby("gd"):
            k = np.searchsorted(dates, np.datetime64(gd_))
            past = v[:k]; pm = mins[:k]
            cur = past[-82:]
            if len(cur) < 3:
                continue
            seas = past[dates[:k] >= np.datetime64("2026-10-01")] if (dates[:k] >= np.datetime64("2026-10-01")).sum() >= 3 else past[-20:]
            for idx, r in gg.iterrows():
                feats.append((idx, seas.mean(), seas.std(ddof=0) + 0.5, past[-10:].mean(), past[-5:].mean(), past[-10:].std(ddof=0), len(seas), pm[-10:].mean(),
                              (seas > r["line"]).mean(), (past[-10:] > r["line"]).mean()))
    F = pd.DataFrame(feats, columns=["idx", "avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10", "over_s", "over10"]).set_index("idx")
    d = d.join(F)
    d["prop"] = d["base_market"].map(MK)
    d = d.merge(bk.drop_duplicates(["gd", "player_id", "prop", "sd", "line"]), on=["gd", "player_id", "prop", "sd", "line"], how="left")
    d["lnf"] = np.log(d["f"]); d["dist"] = (d["line"] - d["anchor"]).abs(); d["rel"] = d["dist"] / d["anchor"].clip(lower=0.5)
    d["z_anchor"] = (d["line"] - d["anchor"]) / d["sd_s"]                      # line vs PrizePicks' centre in the player's own spread
    d["z_form"] = (d["line"] - d["avg_s"]) / d["sd_s"]                         # line vs the player's form
    d["anc_vs_form"] = (d["anchor"] - d["avg_s"]) / d["sd_s"]
    d["sgn"] = np.where(d["sd"] == "o", 1, -1)
    d["mins_to_tip"] = (pd.to_datetime(d["start_time"], utc=True) - pd.to_datetime(d["quoted_at"], utc=True)).dt.total_seconds() / 60
    d["explicit"] = (d["anchor_type"] == "explicit").astype(int)
    d["n_side"] = np.where(d["kind"] == "goblin", d["n_gob"], d["n_dem"])
    print(f"PMF|with form: {d['avg_s'].notna().sum():,} | with a book line: {d['pbook'].notna().sum():,} | days {d['gd'].nunique()}", flush=True)

    # (A) controlled tables
    def tab(x, by, lab):
        g = x.groupby(by)["f"].agg(["count", "median", lambda s: s.quantile(.1), lambda s: s.quantile(.9)])
        g = g[g["count"] >= 15]
        print(f"PMF|  {lab}: " + " | ".join(f"{k}: n {int(r['count'])} f {r['median']:.3f} ({r.iloc[2]:.3f}-{r.iloc[3]:.3f})" for k, r in g.iterrows()), flush=True)
    for kind in ("goblin", "demon"):
        for sd in ("o", "u"):
            x = d[(d["kind"] == kind) & (d["sd"] == sd)]
            if len(x) < 50:
                continue
            print(f"PMF|(A) {kind} {'More' if sd == 'o' else 'Less'}: {len(x):,} quotes", flush=True)
            tab(x, "rung", "by rung")
            r1 = x[x["rung"] == 1]
            tab(r1, "explicit", "rung 1 - regular line present (1) vs switch point (0)")
            tab(r1, pd.cut(r1["anchor"], [0, 1.5, 3.5, 6.5, 10.5, 15.5, 20.5, 25.5, 35.5, 99]), "rung 1 - by anchor level")
            tab(r1, pd.cut(r1["rel"], [0, .05, .1, .15, .2, .3, .5, 1, 9]), "rung 1 - by relative distance from anchor")
            tab(r1, "n_side", "rung 1 - by rungs on that side of the ladder")
            tab(r1, "prop", "rung 1 - by prop")
            tab(r1, pd.cut(r1["anc_vs_form"], [-9, -1, -.5, -.2, 0, .2, .5, 1, 9]), "rung 1 - anchor vs player's season average (in his sd)")
            tab(r1, pd.cut(r1["over_s"], [-.01, .1, .2, .35, .5, .65, .8, .9, 1.01]), "rung 1 - share of his season games over this line")
            tab(r1, pd.cut(r1["mins_to_tip"], [-999, 30, 60, 120, 240, 480, 9999]), "rung 1 - minutes before tip")
            tab(r1, pd.cut(r1["pbook"], [0, .2, .3, .4, .5, .6, .7, .8, 1]), "rung 1 - sportsbooks' chance of this line")

    # (B) accuracy as factors are added (out-of-day)
    base = ["is_dem", "is_over", "rung", "tier"]
    d["is_dem"] = (d["kind"] == "demon").astype(int); d["is_over"] = (d["sd"] == "o").astype(int)
    d["prop_c"] = d["prop"].astype("category").cat.codes
    steps = [("kind, side, rung, tier", base),
             ("+ distance from anchor (units, relative, steps)", base + ["dist", "rel", "lstep"]),
             ("+ anchor level, regular vs switch", base + ["dist", "rel", "lstep", "anchor", "explicit"]),
             ("+ ladder shape", base + ["dist", "rel", "lstep", "anchor", "explicit", "n_gob", "n_dem", "n_side"]),
             ("+ prop", base + ["dist", "rel", "lstep", "anchor", "explicit", "n_gob", "n_dem", "n_side", "prop_c"]),
             ("+ player form", base + ["dist", "rel", "lstep", "anchor", "explicit", "n_gob", "n_dem", "n_side", "prop_c", "avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10", "over_s", "over10", "z_anchor", "z_form", "anc_vs_form"]),
             ("+ minutes before tip", base + ["dist", "rel", "lstep", "anchor", "explicit", "n_gob", "n_dem", "n_side", "prop_c", "avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10", "over_s", "over10", "z_anchor", "z_form", "anc_vs_form", "mins_to_tip"]),
             ("+ sportsbooks' chance (where it exists)", base + ["dist", "rel", "lstep", "anchor", "explicit", "n_gob", "n_dem", "n_side", "prop_c", "avg_s", "sd_s", "avg10", "avg5", "sd10", "gp", "min10", "over_s", "over10", "z_anchor", "z_form", "anc_vs_form", "mins_to_tip", "pbook"])]
    days = sorted(d["gd"].unique())
    folds = np.array_split(np.array(days), 5)
    print(f"PMF|(B) out-of-day accuracy (5 folds of days), target = the leg's real multiplier:", flush=True)
    for lab, cols in steps:
        errs = []; imp = None
        for fd in folds:
            tr = d[~d["gd"].isin(fd)]; te = d[d["gd"].isin(fd)]
            mdl = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=20)
            mdl.fit(tr[cols], tr["lnf"])
            errs.append(np.abs(np.exp(mdl.predict(te[cols]) - te["lnf"].values) - 1))
        e = np.concatenate(errs)
        print(f"PMF|  {lab:50s}: median error {100*np.median(e):.2f}% | p90 {100*np.percentile(e, 90):.2f}% | within 2% {100*(e < .02).mean():.0f}% | within 5% {100*(e < .05).mean():.0f}%", flush=True)
    # permutation importance on the full model (one split)
    cols = steps[-1][1]
    tr = d[~d["gd"].isin(folds[-1])]; te = d[d["gd"].isin(folds[-1])]
    mdl = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=20).fit(tr[cols], tr["lnf"])
    b0 = np.median(np.abs(mdl.predict(te[cols]) - te["lnf"]))
    rng = np.random.default_rng(1); imps = []
    for c in cols:
        x = te[cols].copy(); x[c] = rng.permutation(x[c].values)
        imps.append((np.median(np.abs(mdl.predict(x) - te["lnf"])) - b0, c))
    print("PMF|  factor importance (error added when the factor is scrambled): " + " | ".join(f"{c} +{100*v:.2f}%" for v, c in sorted(imps, reverse=True)[:14]), flush=True)

    # (C) mechanistic: one curve of ln f against z (signed toward harder = demon direction)
    for lab, zc in (("anchor-centred z", "z_anchor"), ("form-centred z", "z_form")):
        x = d[d[zc].notna()].copy()
        x["zz"] = x[zc] * x["sgn"]          # > 0 = harder than the centre for this side
        errs = []
        for fd in folds:
            tr = x[~x["gd"].isin(fd)]; te = x[x["gd"].isin(fd)]
            c = np.polyfit(tr["zz"], tr["lnf"], 3)
            errs.append(np.abs(np.exp(np.polyval(c, te["zz"]) - te["lnf"].values) - 1))
        e = np.concatenate(errs)
        print(f"PMF|(C) one curve on {lab}: median error {100*np.median(e):.2f}% | p90 {100*np.percentile(e, 90):.2f}% | corr {np.corrcoef(x['zz'], x['lnf'])[0, 1]:+.3f}", flush=True)
    x = d[d["pbook"].notna()].copy()
    if len(x) > 100:
        x["lp"] = np.log(x["pbook"])
        errs = []
        for fd in folds:
            tr = x[~x["gd"].isin(fd)]; te = x[x["gd"].isin(fd)]
            if len(tr) < 50 or len(te) == 0:
                continue
            c = np.polyfit(tr["lp"], tr["lnf"], 2)
            errs.append(np.abs(np.exp(np.polyval(c, te["lp"]) - te["lnf"].values) - 1))
        e = np.concatenate(errs)
        print(f"PMF|(C) one curve on the sportsbooks' chance: {len(x):,} legs | median error {100*np.median(e):.2f}% | p90 {100*np.percentile(e, 90):.2f}%", flush=True)
    d[["gd", "nm", "base_market", "sd", "line", "kind", "f", "anchor", "anchor_type", "tier", "rung", "n_gob", "n_dem", "avg_s", "sd_s", "over_s", "pbook", "mins_to_tip"]].to_csv("/tmp/ppmf.csv", index=False)


if __name__ == "__main__":
    main()
