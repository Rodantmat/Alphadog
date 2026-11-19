#!/usr/bin/env python3
"""
S6e - CAN THE WEAK SIGNALS BE ADDED UP? A walk-forward combiner for Underdog REGULAR legs. READ-ONLY. (NBA_HONEST_REBUILD.md section 8l)
The cell scans found no single cell with a repeatable edge on regular legs, only small leads (the system's top Unders; Underdog's line 1+ above
PrizePicks'; the book at 0.52-0.56). This script asks the honest follow-up: do all pre-game features TOGETHER rank Underdog regular legs well enough to beat
0.5345 at the top of a slate, when the combiner is fitted ONLY on earlier seasons?
  features  the 26 bucketed features of research_cell_scan_honest.py (honest model, market, form, injury report at pick time), one-hot, each crossed
            with the side (Under / Over). Nothing from the result; other-app lines from the unfiltered boards (rule C12).
  model     ridge logistic regression (UM_RIDGE, default 30), fitted on the seasons BEFORE the test season: 2025-26 <- 2024-25; 2026-27 <- 2024-25 + 2025-26.
  baselines the honest model probability alone (ph); the side alone (all Unders).
  test      per slate, one leg per player (his best), the top K legs by the combiner (K = 2, 4, 6, 10, 20, 40): hit rate with a 90% range re-drawing
            slates, share of Unders; then slips from the top 6: 3 x 2-pick Standard, and from the top 12: 3 x 4-pick Flex (Underdog tables).
  placebo   the same pipeline with the TRAINING results shuffled inside each slate: the top-K hit rate must fall back to the slate average.
Env: DATABASE_URL, UM_RIDGE.
"""
import os

import numpy as np
import pandas as pd
import psycopg

os.environ["CS_APP"] = "underdog"; os.environ["CS_KIND"] = "regular"
import research_cell_scan_honest as CS                      # noqa: E402

RIDGE = float(os.environ.get("UM_RIDGE") or 30)
BE = 0.5345
FLEX4 = {4: 7.2, 3: 1.4}
rng = np.random.default_rng(41)


def fit(X, y, ridge):
    b = np.zeros(X.shape[1])
    for _ in range(30):
        p = 1 / (1 + np.exp(-(X @ b))); w = p * (1 - p) + 1e-9
        H = (X.T * w) @ X + ridge * np.eye(X.shape[1]); H[0, 0] -= ridge
        g = X.T @ (y - p) - ridge * b; g[0] += ridge * b[0]
        st = np.linalg.solve(H, g); b = b + st
        if np.abs(st).max() < 1e-6:
            break
    return b


def boot_hit(h, gd):
    u, inv = np.unique(gd, return_inverse=True)
    s = np.bincount(inv, weights=h, minlength=len(u)); c = np.bincount(inv, minlength=len(u)); ix = rng.integers(len(u), size=(300, len(u)))
    b = s[ix].sum(1) / c[ix].sum(1); return np.quantile(b, .05), np.quantile(b, .95)


def design(F, under):
    cols = [np.ones(len(F)), under.astype(float)]; names = ["const", "Under"]
    for c in F.columns:
        cat = pd.Categorical(F[c].astype(object).where(F[c].notna(), None))
        for k, lab in enumerate(cat.categories):
            m = (cat.codes == k)
            if m.sum() < 300:
                continue
            for sd, sm in (("U", under), ("O", ~under)):
                cols.append((m & sm).astype(float)); names.append(f"{c}={lab}|{sd}")
    return np.column_stack(cols), names


def report(tag, d, score):
    d = d.assign(sc=score).sort_values("sc", ascending=False).drop_duplicates(["gd", "player_id"])
    out = []
    for K in (2, 4, 6, 10, 20, 40):
        t = d.groupby("gd").head(K); lo, hi = boot_hit(t["hit"].values.astype(float), t["gd"].values)
        out.append(f"top {K}: {t['hit'].mean():.3f} [{lo:.3f} .. {hi:.3f}] n{len(t):,} U{100 * t['under'].mean():.0f}%")
    print(f"UM|  {tag:34s} " + " | ".join(out), flush=True)
    # slips: 3 x 2-pick Standard from the top 6 ; 3 x 4-pick Flex from the top 12 (round-robin by rank)
    r2 = []; r4 = []
    for gd, g in d.groupby("gd"):
        h = g["hit"].values[:12]
        if len(h) >= 6:
            r2.append(sum((3.5 if h[i] + h[i + 3] == 2 else 0.0) - 1 for i in range(3)))
        if len(h) >= 12:
            r4.append(sum(FLEX4.get(int(h[[i, i + 3, i + 6, i + 9]].sum()), 0.0) - 1 for i in range(3)))
    for nm, r in (("3 x 2-pick Standard (top 6)", r2), ("3 x 4-pick Flex (top 12)", r4)):
        if len(r) >= 10:
            r = np.array(r); ix = rng.integers(len(r), size=(300, len(r))); b = r[ix].mean(1) / 3; cum = np.concatenate([[0], np.cumsum(r)])
            print(f"UM|      {nm}: slates {len(r)}, ROI {100 * r.mean() / 3:+.1f}% [{100 * np.quantile(b, .05):+.1f} .. {100 * np.quantile(b, .95):+.1f}], units {r.sum():+.1f}, "
                  f"max drawdown {float((np.maximum.accumulate(cum) - cum).max()):.1f}", flush=True)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    df, F = CS.load(conn); conn.close()
    df = df.reset_index(drop=True); F = F.reset_index(drop=True)
    under = df["under"].values; X, names = design(F, under); y = df["hit"].values.astype(float)
    print(f"UM|Underdog regular legs {len(df):,}; design {X.shape[1]} columns; ridge {RIDGE}; break-even {BE}", flush=True)
    for test, train in (("2025-26", ["2024-25"]), ("2026-27", ["2024-25", "2025-26"])):
        tr = df["season"].isin(train).values; te = (df["season"] == test).values
        if te.sum() < 500:
            continue
        b = fit(X[tr], y[tr], RIDGE); p = 1 / (1 + np.exp(-(X[te] @ b))); d = df[te]
        print(f"\nUM|=== test {test} (fitted on {' + '.join(train)}: {int(tr.sum()):,} legs; test {int(te.sum()):,} legs on {d['gd'].nunique()} slates; all Unders hit {d[d['under']]['hit'].mean():.3f}) ===", flush=True)
        report("COMBINER (all features)", d, p)
        report("honest model alone, Unders", d[d["under"]], d[d["under"]]["ph"].fillna(0).values)
        report("honest model alone, both sides", d, d["ph"].fillna(0).values)
        ys = df.loc[tr].groupby(["gd", "sd"])["hit"].transform(lambda x: rng.permutation(x.values)).values.astype(float)
        bp = fit(X[tr], ys, RIDGE); report("PLACEBO (training results shuffled)", d, 1 / (1 + np.exp(-(X[te] @ bp))))
        top = np.argsort(-np.abs(b[2:]))[:14] + 2
        print("UM|  largest weights: " + "; ".join(f"{names[i]} {b[i]:+.2f}" for i in top), flush=True)
        sl = np.polyfit(p, y[te], 1)[0]
        print(f"UM|  honesty of the combiner: slope of real on predicted {sl:.2f}; predicted top tenth {np.quantile(p, .9):.3f}+ hits {y[te][p >= np.quantile(p, .9)].mean():.3f}", flush=True)
    print("UM|DONE", flush=True)


if __name__ == "__main__":
    main()
