#!/usr/bin/env python3
"""
PP MULTIPLIER FACTORS v2 - THE LADDER AS IT WAS AT THE MOMENT OF THE QUOTE. READ-ONLY. (owner 2026-11-20 17:08 PT)
v1 joined each quote to a once-a-day ladder; prices drift through the day, so here every quote is joined to the board PrizePicks showed in
the SAME probe run (nba_market.pp_board_row, same run_file): the regular line (or the switch point = midway between the top goblin and the
lowest demon when there is no regular line), every goblin / demon rung of that player-stat, the step between rungs.
Target: the leg's real multiplier (2-pick factor). PrizePicks only uses fixed values (goblin 1/30 grid, demon 1/12 grid then wider), so the
test is EXACT: predict, snap to the nearest real value, count exact hits (out-of-day, 5 folds).
Also: does the drift come from the ladder moving? Same leg re-quoted - how often the factor changed when the ladder did / did not move.
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


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    since = os.environ.get("PPMF_SINCE", "2026-10-20")
    m = pd.read_sql("""SELECT run_file, (quoted_at AT TIME ZONE 'America/Los_Angeles')::date gd, quoted_at, projection_id::text pid, line::float8 line, kind, lower(left(side,1)) sd,
                              factor_mined::float8 f FROM nba_market.pp_mined_leg WHERE factor_mined IS NOT NULL AND kind IN ('goblin','demon') AND quoted_at >= %s""", conn, params=(since,))
    runs = tuple(m["run_file"].unique())
    b = pd.read_sql("SELECT run_file, projection_id::text pid, player_id::text ppid, player, stat, line::float8 line, odds, start_time FROM nba_market.pp_board_row WHERE run_file = ANY(%s)", conn, params=(list(runs),))
    conn.close()
    print(f"PMF2|quotes {len(m):,} in {len(runs)} runs | board rows {len(b):,}", flush=True)
    b = b[~b["player"].str.contains(r"\+", regex=True, na=False)]
    key = ["run_file", "ppid", "stat"]
    g = b.groupby(key)
    shape = g.apply(lambda x: pd.Series({
        "std": x.loc[x["odds"] == "standard", "line"].median() if (x["odds"] == "standard").any() else np.nan,
        "gmax": x.loc[x["odds"] == "goblin", "line"].max(), "gmin": x.loc[x["odds"] == "goblin", "line"].min(),
        "dmin": x.loc[x["odds"] == "demon", "line"].min(), "dmax": x.loc[x["odds"] == "demon", "line"].max(),
        "n_gob": int((x["odds"] == "goblin").sum()), "n_dem": int((x["odds"] == "demon").sum()),
        "lstep": float(np.min(np.diff(np.sort(x["line"].unique())))) if x["line"].nunique() > 1 else np.nan,
        "lines": tuple(sorted(x["line"].unique()))})).reset_index()
    shape["explicit"] = shape["std"].notna().astype(int)
    sw = np.where(shape["gmax"].notna() & shape["dmin"].notna(), (shape["gmax"] + shape["dmin"]) / 2,
                  np.where(shape["gmax"].notna(), shape["gmax"] + 0.5, shape["dmin"] - 0.5))
    shape["anchor"] = shape["std"].where(shape["std"].notna(), sw)
    me = m.merge(b[["run_file", "pid", "ppid", "stat", "start_time"]], on=["run_file", "pid"], how="inner").merge(shape, on=key, how="inner")
    d = me.copy()
    d["dist"] = (d["line"] - d["anchor"]).abs()
    d["rel"] = d["dist"] / d["anchor"].clip(lower=0.5)
    d["dsq"] = d["dist"] / np.sqrt(d["anchor"].clip(lower=0.5))
    d["steps"] = d["dist"] / d["lstep"].replace(0, np.nan)
    # rung: position among the same kind on the board at that moment, nearest the anchor = 1
    def rung(r):
        ls = [l for l in r["lines"] if (l < r["anchor"] if r["kind"] == "goblin" else l > r["anchor"])]
        ls = sorted(ls, key=lambda l: abs(l - r["anchor"]))
        return ls.index(r["line"]) + 1 if r["line"] in ls else np.nan
    d["rung"] = d.apply(rung, axis=1)
    d["n_side"] = np.where(d["kind"] == "goblin", d["n_gob"], d["n_dem"])
    d["is_dem"] = (d["kind"] == "demon").astype(int); d["is_over"] = (d["sd"] == "o").astype(int)
    d["stat_c"] = d["stat"].astype("category").cat.codes
    d["mins_to_tip"] = (pd.to_datetime(d["start_time"], utc=True) - pd.to_datetime(d["quoted_at"], utc=True)).dt.total_seconds() / 60
    d["lnf"] = np.log(d["f"])
    print(f"PMF2|quotes with their same-run ladder: {len(d):,} ({100*len(d)/len(m):.0f}%) | explicit regular line {100*d['explicit'].mean():.0f}% | days {d['gd'].nunique()}", flush=True)
    grid = {k: np.array(sorted(v.round(4).unique())) for k, v in d.groupby(["kind", "sd"])["f"]}
    for k, v in grid.items():
        print(f"PMF2|grid {k}: {len(v)} values {list(v[:8])} ... {list(v[-4:])}", flush=True)

    # drift: same projection re-quoted in different runs
    dd = d.sort_values("quoted_at").groupby(["pid", "sd"])
    rows = []
    for _, x in dd:
        x = x.drop_duplicates("run_file")
        for (a, r1), (_, r2) in zip(x.iloc[:-1].iterrows(), x.iloc[1:].iterrows()):
            rows.append((r1["f"] != r2["f"], (r1["anchor"] != r2["anchor"]) or (r1["lines"] != r2["lines"]), (pd.to_datetime(r2["quoted_at"]) - pd.to_datetime(r1["quoted_at"])).total_seconds() / 60))
    r = pd.DataFrame(rows, columns=["fchg", "ladchg", "mins"])
    for lc in (False, True):
        x = r[r["ladchg"] == lc]
        print(f"PMF2|re-quotes with the ladder {'MOVED' if lc else 'unchanged'}: {len(x):,} | factor changed {100*x['fchg'].mean():.1f}% | median gap {x['mins'].median():.0f} min", flush=True)
    x = r[~r["ladchg"]]
    for lo, hi in ((0, 30), (30, 120), (120, 360), (360, 99999)):
        y = x[(x["mins"] >= lo) & (x["mins"] < hi)]
        if len(y):
            print(f"PMF2|   ladder unchanged, gap {lo}-{hi} min: {len(y):,} | factor changed {100*y['fchg'].mean():.1f}%", flush=True)

    # controlled view: goblin / demon More, rung 1, by relative distance - one table per kind
    for kind in ("goblin", "demon"):
        for sd in ("o", "u"):
            x = d[(d["kind"] == kind) & (d["sd"] == sd)]
            if len(x) < 60:
                continue
            print(f"PMF2|{kind} {'More' if sd == 'o' else 'Less'} ({len(x):,}): by rung " + " | ".join(f"{int(k)}: {len(v)} f {v.median():.3f}" for k, v in x.groupby("rung")["f"] if len(v) >= 15), flush=True)
            for rg in (1, 2):
                y = x[x["rung"] == rg]
                t = y.groupby(pd.cut(y["dsq"], [0, .1, .2, .3, .4, .5, .7, 1, 1.5, 9]))["f"].agg(["count", "median", "std"])
                print(f"PMF2|   rung {rg} by distance / sqrt(anchor): " + " | ".join(f"{k}: n {int(v['count'])} f {v['median']:.3f} sd {v['std']:.3f}" for k, v in t.iterrows() if v["count"] >= 10), flush=True)

    # out-of-day exact prediction
    days = sorted(d["gd"].unique()); folds = np.array_split(np.array(days), 5)
    sets = [("kind, side, rung", ["is_dem", "is_over", "rung"]),
            ("+ distance (units, relative, /sqrt anchor, steps)", ["is_dem", "is_over", "rung", "dist", "rel", "dsq", "steps"]),
            ("+ anchor level, regular vs switch, ladder shape", ["is_dem", "is_over", "rung", "dist", "rel", "dsq", "steps", "anchor", "explicit", "n_gob", "n_dem", "n_side", "lstep"]),
            ("+ stat", ["is_dem", "is_over", "rung", "dist", "rel", "dsq", "steps", "anchor", "explicit", "n_gob", "n_dem", "n_side", "lstep", "stat_c"]),
            ("+ minutes before tip", ["is_dem", "is_over", "rung", "dist", "rel", "dsq", "steps", "anchor", "explicit", "n_gob", "n_dem", "n_side", "lstep", "stat_c", "mins_to_tip"])]
    for lab, cols in sets:
        ex = []; er = []
        for fd in folds:
            tr = d[~d["gd"].isin(fd)]; te = d[d["gd"].isin(fd)]
            mdl = HistGradientBoostingRegressor(max_iter=500, learning_rate=0.05, max_leaf_nodes=63, min_samples_leaf=10).fit(tr[cols], tr["lnf"])
            p = np.exp(mdl.predict(te[cols]))
            snap = np.array([grid[(k, s)][np.argmin(np.abs(grid[(k, s)] - v))] for k, s, v in zip(te["kind"], te["sd"], p)])
            ex.append(np.isclose(snap, te["f"].round(4), atol=1e-3)); er.append(np.abs(snap / te["f"] - 1))
        ex = np.concatenate(ex); er = np.concatenate(er)
        print(f"PMF2|{lab:55s}: EXACT {100*ex.mean():.1f}% | within one grid step ~ {100*(er < .05).mean():.0f}% | median error {100*np.median(er):.2f}% | p90 {100*np.percentile(er,90):.2f}%", flush=True)
    d.drop(columns=["lines"]).to_csv("/tmp/ppmf2.csv", index=False)


if __name__ == "__main__":
    main()
