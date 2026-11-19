#!/usr/bin/env python3
"""
PRIZEPICKS LEG HIT RATE / ROI MECHANICS ON HISTORY (owner 2026-11-18 22:31 PT: "why are you looking forward instead of backwards? we have multiple
boards"). READ-ONLY. Every priced PrizePicks leg of two seasons (nba_score._mf_study_fs: model hit probability, the leg's own factor, kind, result),
the same test the other apps got (research_leg_roi_calibration.py): which estimate of the leg's hit chance is closest to the truth and which one
ranks the legs that really return the most, at the leg's own price (break-even 0.56 / factor, multiplier factor / 0.56 - main_ui/board.js legPricing).
  RAW model            final hit probability as stored
  PLAIN ...            the player's own hit rate on this exact line and side: last 10 / last 20 / season / recency-weighted (half-life 25 games)
  DEPLOYED             the board formula (main_ui/roi.js): model + its calibration gap by kind and side (built WITHOUT the season being scored) blended with
                       the price (kappa .89 / .85 / .76, weight .2 / .6 / .6 for regular / goblin / demon)
  FIT ...              logistic fits trained on ONE season and scored on the OTHER (both ways): model only, price only, model + price, + plain rate
Printed per kind (all / regular / goblin / demon) and per season. Legs paying 8.3x or more are left out (the board gives them no ROI).
Env: DATABASE_URL.
"""
import bisect
import os
import sys
import time
import unicodedata
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

T0 = time.time()
STAT = {"points": lambda s: s[0], "rebounds": lambda s: s[1], "assists": lambda s: s[2], "threes_made": lambda s: s[3], "steals": lambda s: s[4],
        "blocks": lambda s: s[5], "turnovers": lambda s: s[6], "pra": lambda s: s[0] + s[1] + s[2], "pts_ast": lambda s: s[0] + s[2],
        "pts_reb": lambda s: s[0] + s[1], "reb_ast": lambda s: s[1] + s[2], "stocks": lambda s: s[4] + s[5]}
KAPPA = {"standard": .89, "goblin": .85, "demon": .76}
PW = {"standard": .2, "goblin": .6, "demon": .6}


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def nk(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return "".join(c for c in s if c.isalnum())


def lg(x):
    x = np.clip(x, 1e-4, 1 - 1e-4)
    return np.log(x / (1 - x))


def fit(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ w)); W = p * (1 - p) + 1e-9
        g = X.T @ (y - p) - 1e-3 * w; H = (X * W[:, None]).T @ X + 1e-3 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g); w = w + step
        if np.abs(step).max() < 1e-7:
            break
    return w


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    names = {}
    for pid, nm in conn.execute("SELECT nba_player_id::text, full_name FROM nba_ref.players").fetchall():
        names.setdefault(nk(nm), pid)
    hist = defaultdict(lambda: ([], []))
    for pid, d, pts, reb, ast, fg3m, stl, blk, tov in conn.execute("""SELECT nba_player_id::text, game_date, pts, reb, ast, fg3m, stl, blk, tov
            FROM nba_stats.player_game_log WHERE game_date >= '2023-10-01' AND min > 0 ORDER BY game_date""").fetchall():
        h = hist[pid]; h[0].append(d); h[1].append((pts or 0, reb or 0, ast or 0, fg3m or 0, stl or 0, blk or 0, tov or 0))
    df = pd.read_sql("""SELECT season, game_date, player, prop, side, line::float8 line, kind, factor::float8 factor, hit::int hit, hp::float8 hp
                        FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL AND factor > 0 AND kind IN ('standard', 'goblin', 'demon')""", conn)
    conn.close()
    log(f"legs {len(df):,}; players with logs {len(hist)}")
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"]).astype(float)
    df["be"] = np.minimum(.99, .56 / df["factor"]); df["m"] = 1.0 / df["be"]
    df = df[df["be"] >= .12].reset_index(drop=True)
    h10 = np.full(len(df), np.nan); h20 = h10.copy(); hsea = h10.copy(); hdec = h10.copy()
    cache = {}
    for i, (pl, pr, ov, ln_, d) in enumerate(zip(df["player"], df["prop"], df["over"], df["line"], df["game_date"])):
        pid = cache.get(pl)
        if pid is None:
            pid = cache[pl] = names.get(nk(pl), "")
        f = STAT.get(pr)
        if not pid or f is None or pid not in hist:
            continue
        ds, ss = hist[pid]
        k = bisect.bisect_left(ds, d)
        vals = [f(s) for s in ss[max(0, k - 120):k]]; dts = ds[max(0, k - 120):k]
        hits = [(v > ln_) if ov else (v < ln_) for v in vals if v != ln_]
        n = len(hits)
        if n < 5:
            continue
        a = np.array(hits, dtype=float)
        h10[i] = (a[-10:].sum() + 1) / (min(n, 10) + 2); h20[i] = (a[-20:].sum() + 1) / (min(n, 20) + 2)
        w = 0.5 ** (np.arange(n)[::-1] / 25.0); hdec[i] = ((a * w).sum() + 1) / (w.sum() + 2)
        yr = d.year if d.month >= 9 else d.year - 1
        sm = [hh for hh, dd in zip([(v > ln_) if ov else (v < ln_) for v in vals], dts) if (dd.year if dd.month >= 9 else dd.year - 1) == yr]
        hsea[i] = (sum(sm) + 1) / (len(sm) + 2)
    df["h10"], df["h20"], df["hsea"], df["hdec"] = h10, h20, hsea, hdec
    log(f"plain rates found for {int(np.isfinite(hdec).sum()):,} of {len(df):,} legs")
    df = df[np.isfinite(df["hdec"])].reset_index(drop=True)
    seasons = sorted(df["season"].unique())
    # DEPLOYED: calibration gap by kind x side x 5%-bin from the OTHER season(s)
    df["b"] = np.clip(np.floor(df["hp"] * 20), 0, 19).astype(int)
    dep = np.zeros(len(df))
    for s in seasons:
        tr = df[df["season"] != s]; te = df["season"] == s
        gap = (tr["hit"] - tr["hp"]).groupby([tr["kind"], tr["over"], tr["b"]]).mean().to_dict()
        g = np.array([gap.get((k, o, b), 0.0) for k, o, b in zip(df.loc[te, "kind"], df.loc[te, "over"], df.loc[te, "b"])])
        pc = np.clip(df.loc[te, "hp"].values + g, .005, .995)
        kp = df.loc[te, "kind"].map(KAPPA).values; w = df.loc[te, "kind"].map(PW).values
        dep[te.values] = np.clip(pc + w * (np.minimum(.99, kp * df.loc[te, "be"].values) - pc), .005, .995)
    df["dep"] = dep
    one = np.ones(len(df)); isg = (df["kind"] == "goblin").astype(float).values; isd = (df["kind"] == "demon").astype(float).values
    feats = {"FIT model only": [one, lg(df["hp"].values)], "FIT price only": [one, lg(df["be"].values)],
             "FIT model + price": [one, lg(df["hp"].values), lg(df["be"].values), df["over"].values, isg, isd],
             "FIT model + price + plain rate": [one, lg(df["hp"].values), lg(df["be"].values), df["over"].values, isg, isd, lg(df["hdec"].values)]}
    est = {"RAW model": df["hp"].values, "PLAIN last 10": df["h10"].values, "PLAIN last 20": df["h20"].values, "PLAIN season to date": df["hsea"].values,
           "PLAIN recency-weighted": df["hdec"].values, "DEPLOYED (board formula)": df["dep"].values}
    y = df["hit"].values.astype(float)
    for name, cols in feats.items():
        X = np.column_stack(cols); out = np.zeros(len(df)); ws = []
        for s in seasons:
            tr = (df["season"] != s).values; te = ~tr
            w = fit(X[tr], y[tr]); out[te] = 1 / (1 + np.exp(-X[te] @ w)); ws.append(np.round(w, 3).tolist())
        est[name] = out
        print(f"RC|coefficients {name}: {ws}", flush=True)
    m = df["m"].values; day = df["game_date"].values
    subsets = [("ALL KINDS", np.ones(len(df), bool))] + [(k.upper() if k != "standard" else "REGULAR", (df["kind"] == k).values) for k in ("standard", "goblin", "demon")] \
        + [(f"SEASON {s}", (df["season"] == s).values) for s in seasons]
    for label, mk in subsets:
        yy = y[mk]; mm = m[mk]; dd = day[mk]; base = yy.mean(); ret = yy * mm - 1
        print(f"RC|PRIZEPICKS {label} - {mk.sum():,} legs on {len(set(dd))} slates; hit rate {base:.3f}; all legs return {100 * ret.mean():+.1f}%", flush=True)
        print("RC|estimator                            Brier  logloss |   top 5% legs: predicted -> real |   top 10%: predicted -> real | top 5 legs a slate: real | bias")
        order = np.argsort(dd, kind="stable"); bounds = np.flatnonzero(np.r_[True, dd[order][1:] != dd[order][:-1], True])
        for name, q0 in est.items():
            q = np.clip(q0[mk], 1e-4, 1 - 1e-4)
            brier = ((q - yy) ** 2).mean(); ll = -(yy * np.log(q) + (1 - yy) * np.log(1 - q)).mean()
            roi = q * mm - 1; o = np.argsort(-roi)
            t5 = o[:max(1, len(o) // 20)]; t10 = o[:max(1, len(o) // 10)]
            per = []
            for a_, b_ in zip(bounds[:-1], bounds[1:]):
                ix = order[a_:b_]; per.extend(ix[np.argsort(-roi[ix])[:5]])
            per = np.array(per)
            print(f"RC|{name:34s} {brier:7.4f} {ll:8.4f} | {100 * roi[t5].mean():+13.1f}% -> {100 * ret[t5].mean():+6.1f}% (hit {100 * yy[t5].mean():4.1f}%) | "
                  f"{100 * roi[t10].mean():+10.1f}% -> {100 * ret[t10].mean():+6.1f}% | {100 * ret[per].mean():+10.1f}% (n={len(per)}) | {100 * (q.mean() - base):+.1f}pp", flush=True)
    log("DONE")


if __name__ == "__main__":
    main()
