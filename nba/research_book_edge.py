#!/usr/bin/env python3
"""
S5c - THE SPORTSBOOK AS THE THIRD INPUT. READ-ONLY. (NBA_HONEST_REBUILD.md section 8c)
S5 showed the honest model adds ~nothing beyond the app's own price, and a PrizePicks regular line has no price signal at all (every regular leg pays the
same). The one input not yet tested per leg is the de-vigged sportsbook probability AT THE APP'S OWN LINE (nba_market.market_consensus, 'window' snapshot,
three seasons) - the textbook pick'em edge: the app posts a fixed-price line, the sharp market disagrees.
For every graded leg of nba_score._lr_legs_h (PrizePicks all kinds; Underdog; Sleeper / Fliff REAL boards only - their 'derived' seasons were built FROM these
sportsbook lines and would be circular) attach p_book = sportsbook chance of the leg's side at the leg's exact line, then:
  1 COVERAGE     share of legs with a sportsbook number, by app / kind / season; with >= 2 books
  2 CALIBRATION  real hit rate by p_book band, per season  (is the book right at the app's line?)
  3 PLAIN RULE   legs whose book-implied return (p_book x price - 1) is above a threshold: legs a slate, real return, by season, 90% range from re-drawing slates
  4 WALK-FORWARD a logistic  hit ~ book + honest model + app price + kind  refitted forward (warm-up BE_WARM slates, step BE_STEP): weights, honesty slope,
                 real return of its top 5 a slate and of all legs it rates positive, by season
Leg return: PrizePicks hit x price / 0.542 - 1 (also shown against 0.577 = the 2-pick Power per-leg break-even); other apps hit x multiplier - 1.
Env: DATABASE_URL, BE_APPS (prizepicks,underdog,sleeper,fliff), BE_WARM (40), BE_STEP (10), BE_MINBOOKS (1).
"""
import os

import numpy as np
import pandas as pd
import psycopg

import research_legs_h_build as LH

APPS = (os.environ.get("BE_APPS") or "prizepicks,underdog,sleeper,fliff").split(",")
WARM = int(os.environ.get("BE_WARM") or 40); STEP = int(os.environ.get("BE_STEP") or 10); MINB = int(os.environ.get("BE_MINBOOKS") or 1)
BASE = 0.542
rng = np.random.default_rng(11)


def lg(p):
    p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))


def fit(X, y, ridge=1e-2):
    b = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ b)); w = p * (1 - p) + 1e-9
        st = np.linalg.solve(X.T @ (X * w[:, None]) + ridge * np.eye(X.shape[1]), X.T @ (y - p) - ridge * b); b = b + st
        if np.abs(st).max() < 1e-7:
            break
    return b


def boot(r, days):
    u = np.unique(days)
    if len(u) < 3 or not len(r):
        return (np.nan, np.nan)
    by = {d: r[days == d] for d in u}
    bs = [np.concatenate([by[d] for d in rng.choice(u, len(u))]).mean() for _ in range(300)]
    return np.quantile(bs, .05), np.quantile(bs, .95)


def line_for(label, sel, nslates):
    if not len(sel):
        print(f"BE|    {label:44s} none", flush=True); return
    lo, hi = boot(sel["r"].values, sel["gd"].values)
    print(f"BE|    {label:44s} legs {len(sel):7,} ({len(sel) / max(1, nslates):6.1f} a slate) hit {sel['hit'].mean():.3f} book says {sel['pb'].mean():.3f} | "
          f"real return {100 * sel['r'].mean():+6.1f}% [{100 * lo:+.1f}% .. {100 * hi:+.1f}%]", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    ids = dict(conn.execute("SELECT norm_name, player_id::text FROM nba_ref.player_name_map").fetchall())
    mc = pd.read_sql("""SELECT game_date::text gd, nba_ref.norm_name(player) nm, market_key, line::float8 line, books, p_over_mean::float8 po
                        FROM nba_market.market_consensus WHERE snapshot_label = 'window' AND market_key = ANY(%s)""", conn, params=(list(LH.MK),))
    mc["player_id"] = mc["nm"].map(ids); mc["prop"] = mc["market_key"].map(LH.MK); mc = mc[mc["player_id"].notna()]
    mc = mc.drop_duplicates(["gd", "player_id", "prop", "line"])[["gd", "player_id", "prop", "line", "books", "po"]]
    print(f"BE|sportsbook rungs (window): {len(mc):,} on {mc['gd'].nunique()} days; >= 2 books {100 * (mc['books'] >= 2).mean():.0f}%", flush=True)
    for app in APPS:
        df = pd.read_sql("""SELECT season, game_date::text gd, player_id, prop, side, line::float8 line, kind, tier, m::float8 m, hit::int hit, ph::float8 ph
                            FROM nba_score._lr_legs_h WHERE app = %s AND hit IS NOT NULL AND m > 0""" + (" AND src = 'real'" if app in ("sleeper", "fliff") else ""),
                         conn, params=(app,))
        if not len(df):
            continue
        df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"])
        if app == "prizepicks":
            df = df[~df["tier"].astype(str).str.contains("-u")].copy(); df["mm"] = df["m"] / BASE
        else:
            df["mm"] = df["m"]; df["kind"] = df["kind"].map({"R": "standard", "F": "goblin", "B": "demon", "main": "standard", "alt": "alt"}).fillna("standard")
        n_all = len(df)
        df = df.merge(mc, on=["gd", "player_id", "prop", "line"], how="left")
        df["pb"] = np.where(df["over"], df["po"], 1 - df["po"]); df["r"] = df["hit"] * df["mm"] - 1
        print(f"\nBE|================ {app.upper()} : {n_all:,} graded legs ================", flush=True)
        print("BE|=== 1 COVERAGE ===")
        for (s, k), g in df.groupby(["season", "kind"]):
            print(f"BE|    {s} {k:9s} legs {len(g):8,} | with a sportsbook number {100 * g['pb'].notna().mean():5.1f}% | with >= 2 books {100 * (g['books'] >= 2).mean():5.1f}% | "
                  f"all-leg return {100 * g['r'].mean():+6.1f}%", flush=True)
        d = df[df["pb"].notna() & (df["books"] >= MINB)].copy()
        if not len(d):
            continue
        nsl = d.groupby("season")["gd"].nunique().to_dict()
        print("BE|=== 2 CALIBRATION: real hit rate by sportsbook band ===")
        bands = [0, .30, .40, .45, .48, .50, .52, .54, .56, .58, .60, .65, .70, .80, 1.01]
        for k in sorted(d["kind"].unique()):
            for s, g in d[d["kind"] == k].groupby("season"):
                cells = []
                for lo, hi in zip(bands[:-1], bands[1:]):
                    x = g[(g["pb"] >= lo) & (g["pb"] < hi)]
                    if len(x) >= 80:
                        cells.append(f"{lo:.2f}-{hi:.2f}: {x['hit'].mean():.3f} (n {len(x):,})")
                print(f"BE|    {k:9s} {s} " + " | ".join(cells), flush=True)
        print("BE|=== 3 PLAIN RULE: legs the sportsbook rates above the app's price (book-implied return = p_book x price - 1) ===")
        d["br"] = d["pb"] * d["mm"] - 1
        for th in (0.0, 0.03, 0.06, 0.10, 0.15):
            print(f"BE|  book-implied return > {100 * th:+.0f}%", flush=True)
            for s in sorted(d["season"].unique()):
                for k in ["ALL"] + sorted(d["kind"].unique()):
                    x = d[(d["season"] == s) & (d["br"] > th) & ((d["kind"] == k) | (k == "ALL"))]
                    line_for(f"{s} {k}", x, nsl[s])
                x2 = d[(d["season"] == s) & (d["br"] > th) & (d["books"] >= 2)]
                line_for(f"{s} ALL, >= 2 books", x2, nsl[s])
        if app == "prizepicks":
            print("BE|  PrizePicks regular lines against the 2-pick Power break-even 0.577: sportsbook chance >= x")
            for th in (.56, .58, .60, .62, .65):
                for s in sorted(d["season"].unique()):
                    x = d[(d["season"] == s) & (d["kind"] == "standard") & (d["pb"] >= th)]
                    if len(x):
                        print(f"BE|    p_book >= {th:.2f} {s}: legs {len(x):6,} ({len(x) / nsl[s]:5.1f} a slate) hit {x['hit'].mean():.3f} (+- {x['hit'].std() / np.sqrt(len(x)):.3f}) | "
                              f"by side {x.groupby('side')['hit'].agg(['mean', 'size']).round(3).to_dict('index')}", flush=True)
        print("BE|=== 4 WALK-FORWARD: hit ~ book + honest model + app price + kind (fitted on the past only) ===")
        d = d.sort_values("gd").reset_index(drop=True); days = np.array(sorted(d["gd"].unique()))
        kinds = [k for k in sorted(d["kind"].unique()) if k != "standard"]
        mis = d["ph"].isna().values
        cols = [np.ones(len(d)), lg(d["pb"].values), np.where(mis, lg(d["pb"].values), lg(d["ph"].fillna(.5).values)), mis * 1.0, lg(np.clip(1 / d["mm"].values, .02, .98)), d["over"].values * 1.0]
        names = ["const", "book", "model", "model missing", "app price", "over"]
        for k in kinds:
            cols.append((d["kind"] == k).values * 1.0); names.append(k)
        X = np.column_stack(cols); y = d["hit"].values.astype(float); pred = np.full(len(d), np.nan); gdv = d["gd"].values; wts = []
        for i in range(WARM, len(days), STEP):
            tr = gdv < days[i]; te = (gdv >= days[i]) & (gdv < (days[i + STEP] if i + STEP < len(days) else "9999"))
            b = fit(X[tr], y[tr]); pred[te] = 1 / (1 + np.exp(-X[te] @ b)); wts.append(b)
        if not wts:
            print("BE|    not enough slates", flush=True); continue
        W = np.array(wts)
        print("BE|    weights first fit / last fit: " + "; ".join(f"{n} {W[0][j]:+.2f}/{W[-1][j]:+.2f}" for j, n in enumerate(names)), flush=True)
        d["pred"] = pred * d["mm"].values - 1; t = d[np.isfinite(pred)].copy()
        sl = np.polyfit(t["pred"], t["r"], 1)[0]
        print(f"BE|    honesty slope (real return on predicted) {sl:.2f} on {len(t):,} legs", flush=True)
        for s in ["ALL"] + sorted(t["season"].unique()):
            g = t if s == "ALL" else t[t["season"] == s]; ns = g["gd"].nunique()
            top = pd.concat([x.nlargest(5, "pred") for _, x in g.groupby("gd")]); pos = g[g["pred"] > 0]; p3 = g[g["pred"] > .03]
            for lab, x in (("top 5 a slate", top), ("rated positive", pos), ("rated above +3%", p3)):
                if len(x):
                    lo, hi = boot(x["r"].values, x["gd"].values)
                    print(f"BE|    {s:8s} {lab:16s} legs {len(x):7,} ({len(x) / ns:6.1f} a slate) predicted {100 * x['pred'].mean():+6.1f}% real {100 * x['r'].mean():+6.1f}% [{100 * lo:+.1f}% .. {100 * hi:+.1f}%] | "
                          f"kinds {x['kind'].value_counts().to_dict()}", flush=True)
    conn.close()
    print("BE|DONE", flush=True)


if __name__ == "__main__":
    main()
