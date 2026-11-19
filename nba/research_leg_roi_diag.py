#!/usr/bin/env python3
"""
WHY DOES THE PER-LEG ROI MODEL MISS THIS SEASON? (owner 2026-11-19 09:04 PT: keep testing until it works). READ-ONLY, reads nba_score._lr_app_legs (cache) and
nba_score._mf_study_fs. Descriptive, per season and per month:
  A  what the board is made of (legs a slate by tier, price, hit, return)
  B  how much information the model carries: a logistic fit INSIDE each period of hit on model log-odds + price log-odds (weights), the same with the baseline
     model and with the score, and the model's own ranking power inside price bands (hit of the top fifth minus bottom fifth by model, same price)
  C  how far the model's number sits from the price (spread of model log-odds minus price log-odds): a wider spread with a lower weight = over-confident model
Env: DATABASE_URL, LR_APP (underdog | pp).
"""
import os

import numpy as np
import pandas as pd
import psycopg

APP = (os.environ.get("LR_APP") or "underdog").lower()


def lg(x):
    x = np.clip(np.asarray(x, float), 1e-4, 1 - 1e-4)
    return np.log(x / (1 - x))


def fit(X, y):
    w = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ w)); W = p * (1 - p) + 1e-9
        st = np.linalg.solve((X * W[:, None]).T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ (y - p) - 1e-3 * w); w += st
        if np.abs(st).max() < 1e-7:
            break
    p = np.clip(1 / (1 + np.exp(-X @ w)), 1e-6, 1 - 1e-6)
    return w, -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()


def block(df, label):
    y = df["hit"].values.astype(float); m = df["m"].values; be = 1 / m; nd = df["game_date"].nunique()
    one = np.ones(len(df)); ov = df["over"].values
    out = [f"{label:26s} legs {len(df):8,} ({len(df) / nd:6.0f} a slate, {nd:3d} slates) price {np.median(m):.2f}x hit {y.mean():.3f} return {100 * (y * m - 1).mean():+6.1f}%"]
    _, ll0 = fit(np.column_stack([one, lg(be), ov]), y)
    for nm in ("p", "base", "score"):
        if nm not in df or df[nm].isna().all():
            continue
        v = df[nm].values.astype(float); ok = np.isfinite(v)
        if nm == "score":
            x = (v - np.nanmean(v)) / (np.nanstd(v) + 1e-9)
        else:
            x = lg(v)
        w, ll = fit(np.column_stack([one, x, lg(be), ov])[ok], y[ok])
        _, llb = fit(np.column_stack([one, lg(be), ov])[ok], y[ok])
        out.append(f"{nm}: weight {w[1]:+.2f} (price {w[2]:+.2f}) gain {1e4 * (llb - ll):5.1f}")
    v = lg(df["p"].values); d = v - lg(be)
    out.append(f"model-minus-price spread {d.std():.2f} (corr model/price {np.corrcoef(v, lg(be))[0, 1]:+.2f})")
    # ranking power inside price bands
    q = pd.qcut(m, 10, labels=False, duplicates="drop"); gaps = []; wts = []
    for b in np.unique(q):
        k = q == b; r = d[k]
        if k.sum() < 200:
            continue
        hi = r >= np.quantile(r, .8); lo = r <= np.quantile(r, .2)
        gaps.append(y[k][hi].mean() - y[k][lo].mean()); wts.append(k.sum())
    out.append(f"top-fifth minus bottom-fifth hit by model, same price: {100 * np.average(gaps, weights=wts):+5.1f} pts")
    print("LD|" + " | ".join(out), flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    if APP == "underdog":
        df = pd.read_sql("SELECT season, game_date, prop, side, tier, m * 1.8708 m, p, base, score, hit FROM nba_score._lr_app_legs WHERE app = 'underdog'", conn)
    else:
        a = pd.read_sql("""SELECT season, game_date, prop, side, tier, factor::float8 / 0.542 m, hp::float8 p, NULL::float8 base, NULL::float8 score, hit::int hit
                           FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL AND kind = 'standard'""", conn)
        b = pd.read_sql("SELECT season, game_date, prop, side, tier, m / 0.542 m, p, base, score, hit FROM nba_score._lr_app_legs WHERE app = 'pp26'", conn)
        df = pd.concat([a, b], ignore_index=True)
    conn.close()
    df = df[(df["m"] > 1.0) & (df["m"] < 8.3)].copy()
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"]).astype(float); df["month"] = df["game_date"].astype(str).str[:7]
    print(f"LD|=== {APP.upper()}: A + B + C by season ===")
    for s in sorted(df["season"].unique()):
        block(df[df["season"] == s], f"season {s}")
    print("LD|=== by season and tier ===")
    for s in sorted(df["season"].unique()):
        for t in sorted(df["tier"].unique()):
            k = df[(df["season"] == s) & (df["tier"] == t)]
            if len(k) >= 1500:
                block(k, f"{s} tier {t}")
    print("LD|=== by month ===")
    for mo in sorted(df["month"].unique()):
        k = df[df["month"] == mo]
        if len(k) >= 3000:
            block(k, f"month {mo}")
    print("LD|=== first 28 slates of each season (same point of the calendar) ===")
    for s in sorted(df["season"].unique()):
        k = df[df["season"] == s]; days = sorted(k["game_date"].unique())[:28]
        block(k[k["game_date"].isin(days)], f"{s} first 28 slates")
    print("LD|=== by season, side and prop group ===")
    grp = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combo", "pts_reb": "combo", "pts_ast": "combo", "reb_ast": "combo"}
    df["grp"] = df["prop"].map(grp).fillna("low-count")
    for s in sorted(df["season"].unique()):
        for sd in (1.0, 0.0):
            k = df[(df["season"] == s) & (df["over"] == sd)]
            if len(k) >= 1500:
                block(k, f"{s} {'over' if sd else 'under'}")
        for g in sorted(df["grp"].unique()):
            k = df[(df["season"] == s) & (df["grp"] == g)]
            if len(k) >= 1500:
                block(k, f"{s} {g}")
    print("LD|DONE", flush=True)


if __name__ == "__main__":
    main()
