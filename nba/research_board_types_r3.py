#!/usr/bin/env python3
"""
RESEARCH - BOARD TYPES, ROUND 3: ONE MODEL OVER EVERY FACTOR OF ROUNDS 1 + 2 (~137), TO CATCH COMBINATIONS SINGLE-FACTOR TESTS MISS
(2026-10-23; owner 10:25 PT "you try those 50, 100. You need to try another 50, 100"; 10:30 PT "multiple profiles tested to see what
really turns out into something"). READ-ONLY.

FEATURES: exactly the factors of research_board_types (round 1) and research_board_types_r2 (round 2), built by their own code (their
main() is run with analyze() captured - no re-implementation), aligned on (season, day, player, prop, tier, side, line).
MODELS of the residual hit - final_hp (each fitted on ONE season, applied to the OTHER, both directions; the label never crosses):
  RIDGE   additive: one-hot of every factor x side, least squares with an L2 penalty (all main effects jointly)
  HGB     scikit-learn HistGradientBoostingRegressor on the categorical codes + side + line type + final_hp itself (interactions);
          early stopping on a 15% day-held-out part of the FIT season, depth 4, 0.05 learning rate
  p' = clip(final_hp + prediction, 0.01, 0.99)
REPORTED: log-loss change vs final_hp on the other season (day-clustered z); calibration by bucket; the top permutation importances
(HGB, fit 2024-25); and every calibrated structure + the live pair rebuilt on p' (as research_final_hp_form), both seasons.
Env: DATABASE_URL, R3_SAMPLE (slates per season for a probe; 0 = all).
"""
import math
import os
import subprocess
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE                       # noqa: E402
import calib_slips as CS                             # noqa: E402
import research_board_types as BT                    # noqa: E402
import research_board_types_r2 as R2                 # noqa: E402
import research_pp_calibrated_slips as RC            # noqa: E402
import research_pp_flex234 as F                      # noqa: E402
import research_pp_board_profiles_v3 as V3           # noqa: E402

SEASONS = BT.SEASONS
T0 = time.time()
KEY = ["season", "d", "nm", "prop", "tier", "side", "line"]


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def day_z(vals, days):
    s = pd.Series(vals).groupby(np.asarray(days)).agg(["sum", "count"])
    mu = float(np.mean(vals))
    D = len(s)
    se = math.sqrt(((s["sum"] - s["count"] * mu) ** 2).sum() * D / max(D - 1, 1)) / len(vals)
    return mu, (mu / se if se > 0 else 0.0), D


def capture(module_main):
    """run a round's main() with BT.analyze replaced; return its (df, feats)"""
    got = {}
    orig = BT.analyze

    def grab(df, feats):
        got["df"], got["feats"] = df, feats
    BT.analyze = grab
    try:
        module_main()
    finally:
        BT.analyze = orig
    return got["df"], got["feats"]


def codes_frame(df, feats, prefix):
    out = pd.DataFrame(index=df.index)
    for f, vals in feats.items():
        c, _ = pd.factorize(pd.Series(vals).fillna("~").astype(str))
        out[prefix + f] = c.astype(np.int16)
    out[KEY] = df[KEY].values
    return out


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "scikit-learn"], check=True)
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.inspection import permutation_importance

    if os.environ.get("R3_SAMPLE"):
        os.environ["BT_SAMPLE"] = os.environ["R3_SAMPLE"]
        BT.SAMPLE = int(os.environ["R3_SAMPLE"])
    df1, f1 = capture(BT.main)
    A = codes_frame(df1, f1, "r1_")
    base = df1[KEY + ["p", "hit"]].copy()
    del f1
    log(f"round 1 factors: {A.shape[1] - len(KEY)}")
    df2, f2 = capture(R2.main)
    B = codes_frame(df2, f2, "r2_")
    del f2, df2, df1
    log(f"round 2 factors: {B.shape[1] - len(KEY)}")
    for c in ("line",):
        A[c] = A[c].astype(float); B[c] = B[c].astype(float); base[c] = base[c].astype(float)
    M = base.merge(A, on=KEY, how="inner").merge(B, on=KEY, how="inner")
    M = M.drop_duplicates(KEY).reset_index(drop=True)
    log(f"aligned legs: {len(M):,}")
    fcols = [c for c in M.columns if c.startswith(("r1_", "r2_"))]
    M["side_c"] = (M.side == "Over").astype(np.int16)
    M["lt_c"] = pd.factorize(M.tier.str[0])[0].astype(np.int16)
    M["prop_c"] = pd.factorize(M.prop)[0].astype(np.int16)
    y = M.hit.values.astype(float)
    p0 = M.p.values.astype(float)
    r = y - p0
    seas = M.season.values

    def ll(p, yy):
        p = np.clip(p, 1e-4, 1 - 1e-4)
        return -(yy * np.log(p) + (1 - yy) * np.log(1 - p))
    preds = {}
    # ---------------- RIDGE (additive, all factors x side) ----------------
    from scipy import sparse
    rows_i, cols_i = [], []
    ncol = 0
    side_c = M.side_c.values.astype(np.int64)
    for c in fcols + ["lt_c", "prop_c"]:
        v = M[c].values.astype(np.int64) * 2 + side_c          # factor bin x side, from integer codes (no strings)
        u, inv = np.unique(v, return_inverse=True)
        rows_i.append(np.arange(len(M)))
        cols_i.append(inv + ncol)
        ncol += len(u)
    Xs = sparse.csr_matrix((np.ones(sum(len(x) for x in rows_i)), (np.concatenate(rows_i), np.concatenate(cols_i))),
                           shape=(len(M), ncol))
    log(f"ridge design: {Xs.shape[0]:,} x {Xs.shape[1]:,}")
    from scipy.sparse.linalg import cg
    pr = np.full(len(M), np.nan)
    for fit_s, app_s in (SEASONS, SEASONS[::-1]):
        mf, ma = seas == fit_s, seas == app_s
        Xf = Xs[mf]
        lam = 2000.0
        Aop = (Xf.T @ Xf) + lam * sparse.identity(Xs.shape[1], format="csr")
        b, _ = cg(Aop, Xf.T @ r[mf], maxiter=400)
        pr[ma] = Xs[ma] @ b
    preds["RIDGE"] = pr

    # ---------------- HGB (interactions) ----------------
    feat_cols = fcols + ["side_c", "lt_c", "prop_c"]
    Xh = M[feat_cols].values.astype(np.float32)
    Xh = np.column_stack([Xh, p0.astype(np.float32)])
    cat_mask = [True] * len(fcols) + [True, True, True] + [False]
    ph = np.full(len(M), np.nan)
    imp_report = None
    rng = np.random.default_rng(5)
    for fit_s, app_s in (SEASONS, SEASONS[::-1]):
        mf, ma = seas == fit_s, seas == app_s
        dd = M.d.values[mf]
        ud = np.unique(dd)
        hold = set(rng.choice(ud, max(1, int(0.15 * len(ud))), replace=False))
        vmask = np.array([x in hold for x in dd])
        m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.05, max_iter=600, min_samples_leaf=400,
                                          categorical_features=cat_mask, l2_regularization=1.0, early_stopping=True,
                                          validation_fraction=None, n_iter_no_change=30, random_state=5)
        # day-held-out early stopping: fit on the non-held days, the held days as the validation set via a manual loop
        m.set_params(early_stopping=False, max_iter=50)
        best, best_it, model = None, 0, None
        for it in (50, 100, 200, 300, 450, 600):
            m.set_params(max_iter=it)
            m.fit(Xh[mf][~vmask], r[mf][~vmask])
            pv = np.clip(p0[mf][vmask] + m.predict(Xh[mf][vmask]), 0.01, 0.99)
            sc = float(ll(pv, y[mf][vmask]).mean())
            if best is None or sc < best:
                best, best_it = sc, it
        m.set_params(max_iter=best_it)
        m.fit(Xh[mf], r[mf])
        ph[ma] = m.predict(Xh[ma])
        log(f"HGB fitted on {fit_s}: {best_it} iterations (day-held-out log-loss {best:.5f})")
        if fit_s == SEASONS[0]:
            sub = np.where(ma)[0]
            sub = rng.choice(sub, min(60000, len(sub)), replace=False)
            pi = permutation_importance(m, Xh[sub], r[sub], n_repeats=3, random_state=5, scoring="neg_mean_squared_error")
            names = feat_cols + ["final_hp"]
            imp_report = sorted(zip(names, pi.importances_mean), key=lambda x: -x[1])[:30]
    preds["HGB"] = ph

    print("\n" + "=" * 190 + "\nA. LOG-LOSS ON THE OTHER SEASON vs final_hp (negative = better; day-clustered z)")
    padj = {}
    for name, pr_ in preds.items():
        pa = np.clip(p0 + pr_, 0.01, 0.99)
        padj[name] = pa
        for app_s in SEASONS:
            ma = seas == app_s
            dl = ll(pa[ma], y[ma]) - ll(p0[ma], y[ma])
            mu, z, D = day_z(dl, M.d.values[ma])
            print(f"  {name:<6} applied to {app_s}: {mu:+.6f} (z {z:+.1f}, {D} days)")
            for lo, hi in ((0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75), (0.75, 1.01)):
                mo = (p0[ma] >= lo) & (p0[ma] < hi)
                mn = (pa[ma] >= lo) & (pa[ma] < hi)
                print(f"      [{lo:.2f},{hi:.2f}): final_hp n {int(mo.sum()):>7,} hit {y[ma][mo].mean() if mo.any() else float('nan'):.3f} | "
                      f"{name} n {int(mn.sum()):>7,} hit {y[ma][mn].mean() if mn.any() else float('nan'):.3f}")
    if imp_report:
        print("\n  HGB permutation importance (fit 2024-25, on 2025-26 legs): " + ", ".join(f"{n} {v:.2e}" for n, v in imp_report))

    # ---------------- B: slips on each model ----------------
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = RC.load(conn)
    by_season = {s: sorted(d for (ss, d) in days if ss == s) for s in SEASONS}
    look = {}
    for name in padj:
        look[name] = dict(zip(zip(M.d, M.nm, M.prop, M.side, M.line.astype(float)), padj[name]))
    UNITS = [u for u in V3.UNITS if u[0] == "calib"]
    REB4F, CAL3P = V3.REB4F, V3.CAL3P
    reb = defaultdict(list)
    for season, d, k, legs, sg in conn.execute(
            """SELECT season, game_date, k, legs_json, same_game FROM nba_score.slip_engine_slips_wo
               WHERE composition = %s AND size = %s AND structure = %s AND k <= %s AND phase <> 'final7' ORDER BY game_date, k""",
            (REB4F[1], REB4F[2], REB4F[3], V3.KMAX)):
        if season in SEASONS and (season, d) in days:
            reb[(season, d)].append((legs, bool(sg and sg > 0)))

    def grade(slip, structure, sg=None):
        sl = [{"hit": x.get("hit"), "factor": float(x.get("factor") or 1.0), "event_id": x.get("event_id")} for x in slip]
        return SE.grade(sl, structure, same_game=sg)[1] - 1.0

    def pool_for(s, d, variant):
        out = []
        for l in days[(s, d)]:
            if l["prop"] in BT.PROPS and l["p"] is not None:
                q = l["p"] if variant == "BASE" else look[variant].get((d, F.norm(l["player"]), l["prop"], l["side"], float(l["line"])))
                if q is None or q != q:
                    q = l["p"]
                out.append(dict(l, p=float(q)))
        return out
    variants = ["BASE"] + list(padj)
    print("\n" + "=" * 190 + "\nB. EVERY CALIBRATED STRUCTURE (k = 1 slip a day) - ROI % (days, lb5) per variant")
    for u in UNITS:
        line = []
        for s in SEASONS:
            parts = []
            for v in variants:
                prr, st = [], []
                for d in by_season[s]:
                    sl_ = CS.unit_slips(pool_for(s, d, v), u[1], u[2], 1)
                    if sl_:
                        prr.append(grade(sl_[0], u[3])); st.append(1)
                parts.append(f"{v} {100 * sum(prr) / max(len(prr), 1):+6.1f}% ({len(prr)}d, lb5 {100 * V3.lb5(prr, st):+5.1f})")
            line.append(f"{s[2:]}: " + " | ".join(parts))
        print(f"  {V3.tag(u):<22} " + "  ||  ".join(line))
    print("\n  LIVE PAIR (rebounds 4-Flex + calib R 0.70 3-Power; n 2, leg cap 2):")
    for s in SEASONS:
        parts = []
        for v in variants:
            prr, st = [], []
            for d in by_season[s]:
                c3 = CS.unit_slips(pool_for(s, d, v), CAL3P[1], CAL3P[2], V3.KMAX)
                r4 = reb.get((s, d), [])
                taken, use_, seen = [], defaultdict(int), set()
                for k in range(V3.KMAX):
                    for kind, lst in (("r4", r4), ("c3", c3)):
                        if k >= len(lst) or len(taken) >= 2:
                            continue
                        slip, sg = (lst[k] if kind == "r4" else (lst[k], None))
                        keys_ = list(dict.fromkeys(V3.legkey(x) for x in slip))
                        sgn = (kind, tuple(sorted(map(str, keys_))))
                        if sgn in seen or any(use_[x] >= 2 for x in keys_):
                            continue
                        seen.add(sgn)
                        for x in keys_:
                            use_[x] += 1
                        taken.append(grade(slip, "flex" if kind == "r4" else "power", sg))
                    if len(taken) >= 2:
                        break
                if taken:
                    prr.append(sum(taken)); st.append(len(taken))
            parts.append(f"{v} net {sum(prr):+6.1f} ROI {100 * sum(prr) / max(sum(st), 1):+5.1f}% lb5 {100 * V3.lb5(prr, st):+5.1f}% "
                         f"days+ {100 * np.mean([x > 0 for x in prr]):.0f}%")
        print(f"    {s}: " + " | ".join(parts))
    log("done")


if __name__ == "__main__":
    main()
