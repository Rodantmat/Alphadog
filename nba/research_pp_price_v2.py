#!/usr/bin/env python3
"""
PRIZEPICKS GOBLIN / DEMON PRICE PER LEG, v2 - TRAINED ON REAL QUOTES, APPLIED TO THE WHOLE BACKTEST. (owner 2026-11-20 20:03 PT: "priority number 0 ...
figure out the price per leg and adjust the price per leg for the whole backtest")
1. TRAIN on every real PrizePicks quote of a goblin / demon leg (nba_market.pp_mined_leg, 2-pick factor = the leg's price; partner-invariant, 8ap) joined to the
   SAME leg in the backtest table nba_score.v_legs_honest, with features computed ONLY from what the backtest has on every day of every season:
     kind, side, stat, the ladder that day (regular line or switch point, every goblin / demon rung, rung position, rung counts, step), distance from the anchor
     (points, relative, per sqrt(anchor), steps), the sportsbooks' chance at the exact line (nba_score.board_true_hp.market_hp) where present, player form from the
     game logs strictly before the day (season / last-10 / last-5 average and spread, share of games over the line).
2. TEST out of time: train on quotes before PPV2_CUT, predict the later ones; and out of player. Price snapped to PrizePicks' real values for that kind / side.
   Reported: exact, within one step, median error, BIAS (mean signed log error - what would inflate or deflate a backtest ROI), and the leg return computed with
   the predicted price vs with the real price on the same graded legs (the number a backtest would show vs the truth). The old modelled price is scored the same way.
3. APPLY (PPV2_WRITE=1): price every goblin / demon leg of 2024-25, 2025-26, 2026-27 in v_legs_honest -> nba_score.pp_alt_price_v2 (2-pick factor f2, leg
   multiplier and break-even at 2..6 picks through the measured size curves, source = real quote where one exists that day, else model).
Env: DATABASE_URL, PPV2_CUT (2026-11-12), PPV2_WRITE.
"""
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import psycopg

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=False)
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402

MK = {"player_points": "points", "player_rebounds": "rebounds", "player_assists": "assists", "player_threes": "threes_made", "player_steals": "steals", "player_blocks": "blocks",
      "player_turnovers": "turnovers", "player_points_rebounds_assists": "pra", "player_points_rebounds": "pts_reb", "player_points_assists": "pts_ast",
      "player_rebounds_assists": "reb_ast", "player_blocks_steals": "stocks"}
GL = {"points": ["pts"], "rebounds": ["reb"], "assists": ["ast"], "threes_made": ["fg3m"], "steals": ["stl"], "blocks": ["blk"], "turnovers": ["tov"],
      "pra": ["pts", "reb", "ast"], "pts_reb": ["pts", "reb"], "pts_ast": ["pts", "ast"], "reb_ast": ["reb", "ast"], "stocks": ["blk", "stl"]}
TABLE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    cut = os.environ.get("PPV2_CUT", "2026-11-12")
    legs = pd.read_sql("""SELECT season, game_date, player_id::text player_id, prop, lower(left(side,1)) sd, line::float8 line, kind, multiplier::float8 m_old, hit::float8 hit
                          FROM nba_score.v_legs_honest WHERE app='prizepicks'""", conn)
    print(f"PV2|backtest PrizePicks legs {len(legs):,} (goblin / demon {int((legs['kind'] != 'regular').sum()):,})", flush=True)
    # ladder per player / stat / day, More side lines (the ladder is the same both ways)
    lad = legs.drop_duplicates(["game_date", "player_id", "prop", "line", "kind"])
    g = lad.groupby(["game_date", "player_id", "prop"])
    shape = g.apply(lambda x: pd.Series({"reg": x.loc[x["kind"] == "regular", "line"].median() if (x["kind"] == "regular").any() else np.nan,
                                          "gmax": x.loc[x["kind"] == "goblin", "line"].max(), "dmin": x.loc[x["kind"] == "demon", "line"].min(),
                                          "n_gob": int((x["kind"] == "goblin").sum()), "n_dem": int((x["kind"] == "demon").sum()),
                                          "lstep": float(np.min(np.diff(np.sort(x["line"].unique())))) if x["line"].nunique() > 1 else np.nan})).reset_index()
    shape["explicit"] = shape["reg"].notna().astype(int)
    shape["anchor"] = shape["reg"].where(shape["reg"].notna(), np.where(shape["gmax"].notna() & shape["dmin"].notna(), (shape["gmax"] + shape["dmin"]) / 2,
                                                                         np.where(shape["gmax"].notna(), shape["gmax"] + 0.5, shape["dmin"] - 0.5)))
    alt = legs[legs["kind"] != "regular"].merge(shape, on=["game_date", "player_id", "prop"], how="left")
    alt["dist"] = (alt["line"] - alt["anchor"]).abs(); alt["rel"] = alt["dist"] / alt["anchor"].clip(lower=0.5)
    alt["dsq"] = alt["dist"] / np.sqrt(alt["anchor"].clip(lower=0.5)); alt["steps"] = alt["dist"] / alt["lstep"].replace(0, np.nan)
    alt["rung"] = alt.groupby(["game_date", "player_id", "prop", "kind", "sd"])["dist"].rank(method="first")
    # sportsbook chance at the exact line
    bk = pd.read_sql("SELECT game_date, player_id::text player_id, prop, lower(left(side,1)) sd, line::float8 line, market_hp::float8 pbook FROM nba_score.board_true_hp WHERE market_hp IS NOT NULL", conn)
    alt = alt.merge(bk.drop_duplicates(["game_date", "player_id", "prop", "sd", "line"]), on=["game_date", "player_id", "prop", "sd", "line"], how="left")
    print(f"PV2|goblin / demon legs with a sportsbook chance at the exact line: {alt['pbook'].notna().mean()*100:.0f}%", flush=True)
    # form strictly before the day
    gl = pd.read_sql("SELECT nba_player_id::text player_id, game_date, pts, reb, ast, fg3m, stl, blk, tov FROM nba_stats.player_game_log WHERE min > 0 ORDER BY game_date", conn)
    gl["game_date"] = pd.to_datetime(gl["game_date"]); alt["gd"] = pd.to_datetime(alt["game_date"])
    keys = alt[["player_id", "prop", "gd"]].drop_duplicates()
    rows = []
    for (pid, prop), kk in keys.groupby(["player_id", "prop"]):
        h = gl[gl["player_id"] == pid]
        if h.empty or prop not in GL:
            continue
        v = h[GL[prop]].sum(axis=1).values.astype(float); dts = h["game_date"].values
        for gd in kk["gd"].values:
            i = np.searchsorted(dts, gd)
            past = v[max(0, i - 82):i]
            if len(past) < 3:
                continue
            rows.append((pid, prop, gd, past.mean(), past.std() + 0.3, past[-10:].mean(), past[-5:].mean(), past[-10:].std()))
    F = pd.DataFrame(rows, columns=["player_id", "prop", "gd", "avg_s", "sd_s", "avg10", "avg5", "sd10"])
    alt = alt.merge(F, on=["player_id", "prop", "gd"], how="left")
    alt["z_form"] = (alt["line"] - alt["avg_s"]) / alt["sd_s"]; alt["anc_form"] = (alt["anchor"] - alt["avg_s"]) / alt["sd_s"]
    alt["is_dem"] = (alt["kind"] == "demon").astype(int); alt["is_less"] = (alt["sd"] == "u").astype(int)
    alt["prop_c"] = alt["prop"].astype("category").cat.codes
    alt["lpb"] = np.log(alt["pbook"] / (1 - alt["pbook"]))
    # real quotes
    q = pd.read_sql("""SELECT (quoted_at AT TIME ZONE 'America/Los_Angeles')::date game_date, quoted_at, nba_ref.norm_name(player) nm, base_market, line::float8 line, kind,
                              lower(left(side,1)) sd, factor_mined::float8 f FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon')""", conn)
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    q["player_id"] = q["nm"].map(ids); q["prop"] = q["base_market"].map(MK)
    q = q.dropna(subset=["player_id", "prop"]).sort_values("quoted_at").drop_duplicates(["game_date", "player_id", "prop", "sd", "line", "kind"], keep="last")
    tr = alt.merge(q[["game_date", "player_id", "prop", "sd", "line", "kind", "f"]], on=["game_date", "player_id", "prop", "sd", "line", "kind"], how="inner")
    tr["lnf"] = np.log(tr["f"])
    print(f"PV2|real quotes joined to backtest legs: {len(tr):,} on {tr['game_date'].nunique()} days ({tr['game_date'].min()} .. {tr['game_date'].max()})", flush=True)
    grid = {k: np.array(sorted(v.round(4).unique())) for k, v in tr.groupby(["kind", "sd"])["f"]}

    def snap(kind, sd, v):
        gr = grid.get((kind, sd))
        return v if gr is None else gr[np.argmin(np.abs(gr - v))]
    cols = ["is_dem", "is_less", "prop_c", "rung", "dist", "rel", "dsq", "steps", "anchor", "explicit", "n_gob", "n_dem", "lstep", "lpb", "avg_s", "sd_s", "avg10", "avg5",
            "sd10", "z_form", "anc_form"]

    def fit(x):
        return HistGradientBoostingRegressor(max_iter=700, learning_rate=0.04, max_leaf_nodes=31, min_samples_leaf=10).fit(x[cols], x["lnf"])

    def score(te, pred, lab):
        sn = np.array([snap(k, s, v) for k, s, v in zip(te["kind"], te["sd"], pred)])
        le = np.log(sn / te["f"].values)
        out = [f"{lab}: {len(te):,} legs | exact {100*np.mean(np.isclose(sn, te['f'].round(4), atol=1e-3)):.0f}% | within ~one step {100*np.mean(np.abs(le) < .05):.0f}% | "
               f"median error {100*np.median(np.abs(le)):.1f}% | BIAS {100*np.mean(le):+.2f}%"]
        gr = te[te["hit"].notna()]
        if len(gr) > 50:
            sn_g = sn[te["hit"].notna().values]
            r_true = (gr["hit"] * 1.732 * gr["f"] - 1).mean(); r_pred = (gr["hit"] * 1.732 * sn_g - 1).mean()
            out.append(f"leg return on {len(gr):,} graded legs: with REAL price {100*r_true:+.1f}%, with THIS price {100*r_pred:+.1f}% (gap {100*(r_pred-r_true):+.1f} pts)")
        return " | ".join(out)
    tA = tr[tr["game_date"].astype(str) < cut]; tB = tr[tr["game_date"].astype(str) >= cut]
    mdl = fit(tA); pB = np.exp(mdl.predict(tB[cols]))
    print("PV2|OUT OF TIME (train before " + cut + ") " + score(tB, pB, "new model"), flush=True)
    print("PV2|OUT OF TIME old modelled price " + score(tB, tB["m_old"].clip(lower=0.3).values, "old price"), flush=True)
    for (k, s), x in tB.groupby(["kind", "sd"]):
        print(f"PV2|   {k} {'More' if s == 'o' else 'Less'}: " + score(x, np.exp(mdl.predict(x[cols])), "new") + " || " + score(x, x["m_old"].clip(lower=0.3).values, "old"), flush=True)
    pl = np.array(sorted(tr["player_id"].unique())); rng = np.random.default_rng(5); rng.shuffle(pl); folds = np.array_split(pl, 5); preds = np.zeros(len(tr))
    for fp in folds:
        m_ = fit(tr[~tr["player_id"].isin(fp)]); sel = tr["player_id"].isin(fp).values; preds[sel] = np.exp(m_.predict(tr[sel][cols]))
    print("PV2|OUT OF PLAYER (5 folds) " + score(tr, preds, "new model"), flush=True)
    full = fit(tr)
    b0 = np.median(np.abs(full.predict(tr[cols]) - tr["lnf"])); imps = []
    for c in cols:
        x = tr[cols].copy(); x[c] = rng.permutation(x[c].values); imps.append((np.median(np.abs(full.predict(x) - tr["lnf"])) - b0, c))
    print("PV2|factor importance: " + " | ".join(f"{c} +{100*v:.2f}%" for v, c in sorted(imps, reverse=True)[:12]), flush=True)
    if os.environ.get("PPV2_WRITE") == "1":
        # size curves (8ar): single-alternate k-pick payout as a function of the 2-pick payout, fitted on ladder-all quotes
        rows = conn.execute("SELECT n, power, note, legs FROM nba_market.pp_quote WHERE section='LAD' AND status=200").fetchall()
        lad_ = {}
        for n, pw, note, lg in rows:
            pw = pw if isinstance(pw, dict) else json.loads(pw or "{}"); lg = lg if isinstance(lg, list) else json.loads(lg or "[]")
            if not lg or lg[0].get("odds") == "standard":
                continue
            try:
                lad_.setdefault((lg[0]["id"], lg[0]["side"], str(note)), {})[n] = float(pw[str(n)][str(n)])
            except Exception:
                pass
        curves = {}
        for k in (3, 4, 5, 6):
            pts = [(np.log(v[2] / 3), np.log(v[k])) for v in lad_.values() if 2 in v and k in v and 1.9 < v[2] < 18]
            curves[k] = np.polyfit([a for a, _ in pts], [b for _, b in pts], 2)
        alt["f2"] = [snap(k, s, v) for k, s, v in zip(alt["kind"], alt["sd"], np.exp(full.predict(alt[cols])))]
        qq = q.set_index(["game_date", "player_id", "prop", "sd", "line", "kind"])["f"]
        idx = list(zip(alt["game_date"], alt["player_id"], alt["prop"], alt["sd"], alt["line"], alt["kind"]))
        realf = [qq.get(i) for i in idx]
        alt["source"] = ["quote" if r is not None and r == r else "model" for r in realf]
        alt["f2"] = [r if (r is not None and r == r) else m for r, m in zip(realf, alt["f2"])]
        recs = []
        for r in alt.itertuples():
            ms = {2: 1.732 * r.f2}
            for k in (3, 4, 5, 6):
                pk = float(np.exp(np.polyval(curves[k], np.log(r.f2))))
                ms[k] = pk / TABLE[k] ** ((k - 1) / k)
            recs.append((r.season, r.game_date, r.player_id, r.prop, "Over" if r.sd == "o" else "Under", r.line, r.kind, float(r.f2), r.source,
                         *[round(ms[k], 4) for k in (2, 3, 4, 5, 6)], *[round(1 / ms[k], 4) for k in (2, 3, 4, 5, 6)]))
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS nba_score.pp_alt_price_v2")
            cur.execute("""CREATE TABLE nba_score.pp_alt_price_v2 (season text, game_date date, player_id text, prop text, side text, line float8, kind text, f2 float8, source text,
                           m2 float8, m3 float8, m4 float8, m5 float8, m6 float8, be2 float8, be3 float8, be4 float8, be5 float8, be6 float8, built_at timestamptz DEFAULT now())""")
            with cur.copy("COPY nba_score.pp_alt_price_v2 (season, game_date, player_id, prop, side, line, kind, f2, source, m2, m3, m4, m5, m6, be2, be3, be4, be5, be6) FROM STDIN") as cp:
                for rec in recs:
                    cp.write_row(rec)
            cur.execute("CREATE INDEX ON nba_score.pp_alt_price_v2 (game_date, player_id, prop, side, line, kind)")
        conn.commit()
        print(f"PV2|wrote nba_score.pp_alt_price_v2: {len(recs):,} goblin / demon legs (real quote {sum(r[8] == 'quote' for r in recs):,}, model {sum(r[8] == 'model' for r in recs):,})", flush=True)


if __name__ == "__main__":
    main()
