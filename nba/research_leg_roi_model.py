#!/usr/bin/env python3
"""
REALISTIC PER-LEG ROI MODEL - PRIZEPICKS, TESTED ON HISTORY (owner 2026-11-18 22:47 / 22:58 PT: "a realistic ROI model per leg ... how much that leg is
worth (in ROI) on its own ... start testing, simulating and debugging to bring it to a high standard"). READ-ONLY.
Leg ROI = p x m - 1, with
  m   the leg's own multiplier: factor / 0.56 (the board's base, main_ui/board.js legPricing). LR_BASE overrides the base break-even (0.542 = 5/6-pick Flex).
  p   the leg's hit chance. Variants, every one fitted ONLY on slates before the slate being scored (walk-forward, refit every LR_STEP slates, first LR_WARM
      slates are training only), so nothing here sees the future:
        MODEL          the stored model probability
        BOARD          the board formula as deployed (calibration gap + price blend), gap built from earlier slates only
        BLEND          logistic: model log-odds + price log-odds + side + kind (Benter second stage / logit pooling)
        BLEND+         BLEND + price slope per kind (favourite-longshot bias of goblins / demons) + prop family
  then the "winner's curse" correction (legs ranked highest are the ones whose estimate errs high):
        ... +ISO       the raw ROI mapped to the REAL return of earlier legs with the same raw ROI (monotone / isotonic fit per kind, earlier slates only)
The test of "realistic": legs the model rates at X% must really return about X%. Printed per predicted-ROI bucket (legs, predicted, real, +- standard error
by slate), per kind, plus the slope of real on predicted (1.00 = honest, under 1 = overstated) and the real return of the top 5 legs a slate.
Env: DATABASE_URL, LR_BASE (0.56), LR_WARM (60), LR_STEP (10), LR_MAXM (8.3).
"""
import os
import time

import numpy as np
import pandas as pd
import psycopg

T0 = time.time()
BASE = float(os.environ.get("LR_BASE") or 0.56)
WARM = int(os.environ.get("LR_WARM") or 60)
STEP = int(os.environ.get("LR_STEP") or 10)
MAXM = float(os.environ.get("LR_MAXM") or 8.3)
KAPPA = {"standard": .89, "goblin": .85, "demon": .76}
PW = {"standard": .2, "goblin": .6, "demon": .6}
COMBO = {"pra", "pts_ast", "pts_reb", "reb_ast", "stocks"}
LOWC = {"threes_made", "steals", "blocks", "turnovers"}
BINS = [-1e9, -.20, -.10, -.05, -.02, 0, .02, .05, .10, 1e9]
BNAME = ["under -20%", "-20 to -10%", "-10 to -5%", "-5 to -2%", "-2 to 0%", "0 to +2%", "+2 to +5%", "+5 to +10%", "over +10%"]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


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


def pava(x, y, w):
    """Monotone (non-decreasing) fit of y on x. Returns block upper x edges and block values."""
    o = np.argsort(x); x, y, w = x[o], y[o], w[o]
    vals, wts, hi = [], [], []
    for xi, yi, wi in zip(x, y, w):
        vals.append(yi); wts.append(wi); hi.append(xi)
        while len(vals) > 1 and vals[-2] > vals[-1]:
            v = (vals[-2] * wts[-2] + vals[-1] * wts[-1]) / (wts[-2] + wts[-1])
            wts[-2] += wts[-1]; vals[-2] = v; hi[-2] = hi[-1]
            vals.pop(); wts.pop(); hi.pop()
    return np.array(hi), np.array(vals)


def iso_fit(raw, ret, nb=120):
    """Bin raw ROI into quantile bins, real return per bin, monotone fit; returns a predictor."""
    if len(raw) < 2000:
        return lambda r: r
    q = np.quantile(raw, np.linspace(0, 1, nb + 1)[1:-1])
    b = np.searchsorted(q, raw)
    cnt = np.bincount(b, minlength=nb).astype(float); ok = cnt > 0
    xm = np.bincount(b, weights=raw, minlength=nb)[ok] / cnt[ok]; ym = np.bincount(b, weights=ret, minlength=nb)[ok] / cnt[ok]
    hi, vals = pava(xm, ym, cnt[ok])
    cen = np.r_[xm.min(), hi]                                   # piecewise-linear through block centres would need centres; use step with interpolation on edges
    def pred(r):
        k = np.clip(np.searchsorted(hi, r), 0, len(vals) - 1)
        return vals[k]
    return pred


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    df = pd.read_sql("""SELECT season, game_date, prop, side, kind, factor::float8 factor, hit::int hit, hp::float8 hp
                        FROM nba_score._mf_study_fs WHERE hp IS NOT NULL AND hit IS NOT NULL AND factor > 0 AND kind IN ('standard', 'goblin', 'demon')""", conn)
    conn.close()
    df["over"] = df["side"].str.lower().str[0].isin(["o", "m", "h"]).astype(float)
    df["be"] = np.minimum(.99, BASE / df["factor"]); df["m"] = 1.0 / df["be"]
    df = df[df["m"] < MAXM].sort_values("game_date", kind="stable").reset_index(drop=True)
    days = np.array(sorted(df["game_date"].unique())); didx = {d: i for i, d in enumerate(days)}
    df["di"] = df["game_date"].map(didx).values
    log(f"legs {len(df):,} on {len(days)} slates {days[0]} .. {days[-1]}; base break-even {BASE}; warm-up {WARM} slates, refit every {STEP}")
    y = df["hit"].values.astype(float); m = df["m"].values; di = df["di"].values; ret = y * m - 1
    kind = df["kind"].values; isg = (kind == "goblin").astype(float); isd = (kind == "demon").astype(float); one = np.ones(len(df))
    lhp = lg(df["hp"].values); lbe = lg(df["be"].values); ov = df["over"].values
    combo = df["prop"].isin(COMBO).astype(float).values; lowc = df["prop"].isin(LOWC).astype(float).values
    feats = {"BLEND": [one, lhp, lbe, ov, isg, isd],
             "BLEND+": [one, lhp, lbe, ov, isg, isd, lbe * isg, lbe * isd, lhp * isg, lhp * isd, ov * isg, combo, lowc, lowc * isd]}
    P = {"MODEL": df["hp"].values.copy(), "BOARD": np.full(len(df), np.nan)}
    for k in feats:
        P[k] = np.full(len(df), np.nan)
    ISO = {}
    hb = np.clip(np.floor(df["hp"].values * 20), 0, 19).astype(int)
    coef_log = {k: [] for k in feats}
    for start in range(WARM, len(days), STEP):
        tr = di < start; te = (di >= start) & (di < start + STEP)
        if not te.any():
            continue
        # BOARD formula with the calibration gap from earlier slates only
        g = pd.Series(y[tr] - df["hp"].values[tr]).groupby([kind[tr], ov[tr], hb[tr]]).mean().to_dict()
        gap = np.array([g.get((k, o, b), 0.0) for k, o, b in zip(kind[te], ov[te], hb[te])])
        pc = np.clip(df["hp"].values[te] + gap, .005, .995)
        kp = np.array([KAPPA[k] for k in kind[te]]); w = np.array([PW[k] for k in kind[te]])
        P["BOARD"][te] = np.clip(pc + w * (np.minimum(.99, kp * df["be"].values[te]) - pc), .005, .995)
        for name, cols in feats.items():
            X = np.column_stack(cols); wv = fit(X[tr], y[tr])
            P[name][te] = 1 / (1 + np.exp(-X[te] @ wv)); coef_log[name].append(np.round(wv, 3))
    scored = np.isfinite(P["BOARD"])
    # winner's-curse correction: needs out-of-sample raw ROI on EARLIER slates, so it starts one warm-up later
    for name in ("BOARD", "BLEND", "BLEND+"):
        out = np.full(len(df), np.nan); raw = P[name] * m - 1
        for start in range(2 * WARM, len(days), STEP):
            tr = scored & (di < start); te = (di >= start) & (di < start + STEP)
            if not te.any():
                continue
            for k in ("standard", "goblin", "demon"):
                a = tr & (kind == k); b = te & (kind == k)
                if b.any():
                    out[b] = iso_fit(raw[a], ret[a])(raw[b])
        ISO[name + "+ISO"] = out
    for name in feats:
        c = np.array(coef_log[name])
        print(f"LR|coefficients {name}: first {c[0].tolist()} last {c[-1].tolist()} (n fits {len(c)})", flush=True)
    ev = np.isfinite(ISO["BLEND+ISO"])                         # every variant is compared on the same legs
    log(f"scored legs {int(ev.sum()):,} on {len(set(di[ev]))} slates (after two warm-ups)")
    variants = {k: P[k] * m - 1 for k in ("MODEL", "BOARD", "BLEND", "BLEND+")}
    variants.update(ISO)
    subsets = [("ALL KINDS", ev), ("REGULAR", ev & (kind == "standard")), ("GOBLIN", ev & (kind == "goblin")), ("DEMON", ev & (kind == "demon"))]
    for s in sorted(df["season"].unique()):
        subsets.append((f"SEASON {s}", ev & (df["season"] == s).values))
    for label, mk in subsets:
        dd = di[mk]; rr = ret[mk]; nd = len(set(dd))
        print(f"\nLR|=== PRIZEPICKS {label}: {int(mk.sum()):,} legs on {nd} slates; hit {y[mk].mean():.3f}; all legs return {100 * rr.mean():+.1f}% ===", flush=True)
        for name, roi_all in variants.items():
            roi = roi_all[mk]
            # slope of real on predicted over 40 quantile bins (weighted)
            q = np.quantile(roi, np.linspace(0, 1, 41)[1:-1]); b = np.searchsorted(q, roi)
            cnt = np.bincount(b, minlength=40).astype(float); okb = cnt > 0
            xm = np.bincount(b, weights=roi, minlength=40)[okb] / cnt[okb]; ym = np.bincount(b, weights=rr, minlength=40)[okb] / cnt[okb]
            xc = xm - np.average(xm, weights=cnt[okb]); slope = (cnt[okb] * xc * ym).sum() / max(1e-12, (cnt[okb] * xc * xc).sum())
            mae = np.average(np.abs(xm - ym), weights=cnt[okb])
            # top 5 legs a slate and legs rated positive
            order = np.argsort(dd, kind="stable"); bounds = np.flatnonzero(np.r_[True, dd[order][1:] != dd[order][:-1], True])
            top = np.concatenate([order[a_:b_][np.argsort(-roi[order[a_:b_]])[:5]] for a_, b_ in zip(bounds[:-1], bounds[1:])])
            pos = roi > 0
            print(f"LR|{name:11s} slope {slope:5.2f} | avg gap predicted vs real {100 * mae:4.1f} pts | top 5 a slate: predicted {100 * roi[top].mean():+6.1f}% real "
                  f"{100 * rr[top].mean():+6.1f}% | rated positive: {int(pos.sum()):,} legs ({pos.sum() / nd:.0f} a slate) predicted {100 * roi[pos].mean() if pos.any() else 0:+5.1f}% "
                  f"real {100 * rr[pos].mean() if pos.any() else 0:+5.1f}%", flush=True)
            if name in ("BOARD", "BLEND+", "BLEND++ISO", "BLEND+ISO", "BOARD+ISO"):
                bk = np.searchsorted(BINS, roi, side="right") - 1
                for j, bn in enumerate(BNAME):
                    s_ = bk == j
                    if s_.sum() < 200:
                        continue
                    daily = pd.Series(rr[s_]).groupby(dd[s_]).agg(["sum", "count"])
                    tot = daily["sum"].sum() / daily["count"].sum()
                    se = np.sqrt(((daily["sum"] - tot * daily["count"]) ** 2).sum()) / daily["count"].sum()
                    print(f"LR|    {name:11s} {bn:12s} legs {int(s_.sum()):8,} ({s_.sum() / nd:6.1f} a slate) | predicted {100 * roi[s_].mean():+6.1f}% | real {100 * tot:+6.1f}% "
                          f"+- {100 * se:4.1f} | hit {100 * y[mk][s_].mean():4.1f}%", flush=True)
    log("DONE")


if __name__ == "__main__":
    main()
