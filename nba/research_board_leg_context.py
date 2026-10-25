#!/usr/bin/env python3
"""
RESEARCH - DO BOARD PROFILES CHANGE WHICH LEGS HIT? LEG-LEVEL CONTEXT TEST, WALK-FORWARD (2026-10-24). READ-ONLY.

Why (owner 19:13 / 19:38 PT: "impossible nothing works better on its own profile ... deep online research ... how strong systems deal
with it"): strategy-level tests judge a profile on one noisy slip ROI a slate (~40-150 slates a profile); the per-day signal-to-noise
of slip ROI is tiny, so realistic profile edges are undetectable there (power argument, e.g. robotwealth.com 2025-10: n ~ (2.8 / SNR)^2).
Strong practice (Gemini 2.5 Pro consult; hierarchical Bayes / partial pooling literature; 'context as features, not states';
Selectively Contextual Bandits, arXiv 2205.04528) moves the context to the LEG level: ~1,000,000 graded legs instead of ~300 slates.

THE QUESTION: on a profile's slates, does a cell (prop x line type x side) hit more or less than its final_hp says - beyond what the
cell does on all slates? Walk-forward, no look-ahead (every estimate from strictly earlier slates):
  r = hit - final_hp                                             (the model's residual on each leg)
  global cell recalibration   g_c(t)   = shrunk mean residual of cell c on all earlier slates                    (baseline, K_G)
  profile effect              e_pc(t)  = shrunk [mean residual of c on profile p's earlier slates - same on all earlier slates]
  slate t adjusted probability:
     p_G  = final_hp + g_c                                       (global only - the fallback)
     p_P  = p_G + AGG over the profiles slate t belongs to of e_pc, shrunk n / (n + K)
            AGG: mean | sum | pooled (member profiles' legs combined) | sel (only profiles whose |z| > LC_Z: 'use context only when
            it clearly helps')
  LOOK-ALIKE: p_L = p_G + shrunk residual of c on slate t's nn most similar earlier slates minus the global (the board's own profile)
READS on every leg of every slate from the 16th (out of sample):
  BRIER and LOG-LOSS of p_P / p_L vs p_G (lower is better; x 1e4), per AGG and K
  SELECTION: each slate's top LC_TOP legs by margin score p - 0.55 / m (the 3-pick Power per-leg bar, strategy doc 19k), realized
     margin hit - 0.55 / m, p_P / p_L vs p_G
  p: the same with every profile mask CIRCULARLY SHIFTED (keeps each profile's size and runs, breaks its link to the board; LC_NULL
     draws) / random earlier slates for the look-alike; parametric p from the nulls' mean / sd
Cheap (sums per profile x cell), so hundreds of nulls are affordable.
Env: DATABASE_URL, L1_AGNOSTIC, LC_K (default 50,100,200,400,800,1600,3200 legs), LC_KG (default 400), LC_NULL (default 200),
LC_AGG (default mean,sum,pooled,sel), LC_Z (default 2), LC_TOP (default 20), LC_KNN (default 20,40,80), LC_HL (half-lives, recency),
LC_CELL (cell | band), LC_RIDGE (ridge lambdas: context as features), LC_ONLY_RIDGE.
"""
import os
import sys
import time
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_board_profiles_l1 as L1              # noqa: E402

T0 = time.time()
HIST = L1.REAL_HIST
KS = [float(x) for x in os.environ.get("LC_K", "50,100,200,400,800,1600,3200").split(",")]
KG = float(os.environ.get("LC_KG", "400"))
NULLN = int(os.environ.get("LC_NULL", "200"))
AGGS = [x for x in os.environ.get("LC_AGG", "mean,sum,pooled,sel").split(",") if x]
ZSEL = float(os.environ.get("LC_Z", "2"))
TOP = int(os.environ.get("LC_TOP", "20"))
KNN = [int(x) for x in os.environ.get("LC_KNN", "20,40,80").split(",") if x]
# MORE OF WHAT IS WORTH TRYING (owner 19:47 PT: "get all that worth trying and test all, let simulation, testing and debugging tell it"):
HLS = [float(x) for x in os.environ.get("LC_HL", "0").split(",") if x]      # recency: half-lives in slates for every sum (0 = none)
CELLDEF = os.environ.get("LC_CELL", "cell")                                   # "cell" (prop x line type x side) or "band" (x line tercile)
RIDGE = [float(x) for x in os.environ.get("LC_RIDGE", "").split(",") if x]   # CONTEXT AS FEATURES: ridge lambdas (empty = off)
ONLY_RIDGE = os.environ.get("LC_ONLY_RIDGE", "") == "1"
NPC = int(os.environ.get("LC_PC", "20"))                                      # ridge: principal axes of the board features
WARM = 15
RNG = np.random.default_rng(61)


def log(m):
    print(f"[{time.time() - T0:6.0f}s] {m}", flush=True)


def leg_arrays(days, horder):
    """-> per slate: cell index, p, hit, factor arrays; cell names"""
    if CELLDEF == "band":
        # line terciles per (prop, line type) on the FIRST 60 historical slates only (no look-ahead into the evaluation)
        vals = defaultdict(list)
        for k in horder[:60]:
            for l in days[k]:
                vals[(l["prop"], l["tier"])].append(float(l["line"]))
        cut = {c: np.percentile(v, [33.3, 66.7]) for c, v in vals.items() if len(v) >= 30}
        for k in horder:
            for l in days[k]:
                q = cut.get((l["prop"], l["tier"]))
                b = "mid" if q is None else ("low" if l["line"] <= q[0] else "high" if l["line"] > q[1] else "mid")
                l["_cell"] = (l["prop"], l["tier"], l["side"], b)
    else:
        for k in horder:
            for l in days[k]:
                l["_cell"] = (l["prop"], l["tier"], l["side"])
    cells = sorted({l["_cell"] for k in horder for l in days[k]})
    ci = {c: i for i, c in enumerate(cells)}
    S = []
    for k in horder:
        ls = [l for l in days[k] if l["hit"] is not None and l["p"] is not None and l["factor"]]
        S.append((np.array([ci[l["_cell"]] for l in ls], np.int32),
                  np.clip(np.array([float(l["p"]) for l in ls]), 0.01, 0.99),
                  np.array([float(l["hit"]) for l in ls]),
                  np.array([float(l["factor"]) for l in ls])))
    return S, cells


def slate_sums(S, C):
    """per slate: residual sum, residual square sum and leg count per cell"""
    R = np.zeros((len(S), C)); Q = np.zeros((len(S), C)); N = np.zeros((len(S), C))
    for t, (c, p, h, _) in enumerate(S):
        r = h - p
        np.add.at(R[t], c, r); np.add.at(Q[t], c, r * r); np.add.at(N[t], c, 1)
    return R, Q, N


def score(S, t, padj):
    """Brier, log-loss (sums over the slate's legs) and the top-TOP legs' realized margin for an adjusted probability vector"""
    c, p, h, f = S[t]
    q = np.clip(padj, 0.01, 0.99)
    br = float(np.sum((q - h) ** 2))
    ll = float(-np.sum(h * np.log(q) + (1 - h) * np.log(1 - q)))
    sc = q - 0.55 / f
    top = np.argsort(-sc)[:TOP]
    mar = float(np.mean(h[top] - 0.55 / f[top]))
    return br, ll, mar, len(h)


def run_system(S, R, Q, N, masks, aggs, ks, hl=0.0):
    """walk-forward over all slates; -> {(agg, K): (brier diff, logloss diff, margin diff)} vs the global-only recalibration, + base"""
    D, C = R.shape
    P = len(masks)
    M = np.array(masks, bool)                          # P x D
    gR = np.zeros(C); gN = np.zeros(C)                 # all earlier slates
    pR = np.zeros((P, C)); pQ = np.zeros((P, C)); pN = np.zeros((P, C))
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    base = [0.0, 0.0, 0.0]
    nlegs = 0; nsl = 0
    for t in range(D):
        if t >= WARM:
            c, p, h, f = S[t]
            g = np.where(gN > 0, gR / np.maximum(gN, 1), 0) * (gN / (gN + KG))
            pg = p + g[c]
            b_br, b_ll, b_mar, n = score(S, t, pg)
            base[0] += b_br; base[1] += b_ll; base[2] += b_mar
            nlegs += n; nsl += 1
            ps = np.where(M[:, t])[0]
            if len(ps):
                with np.errstate(invalid="ignore", divide="ignore"):
                    pm = np.where(pN[ps] > 0, pR[ps] / np.maximum(pN[ps], 1), 0)                  # profile mean residual per cell
                gm = np.where(gN > 0, gR / np.maximum(gN, 1), 0)
                dev = np.where(pN[ps] > 0, pm - gm[None, :], 0)                                      # profile minus global
                nn_ = pN[ps]
                if "sel" in aggs:
                    var = np.maximum(pQ[ps] / np.maximum(nn_, 1) - pm ** 2, 1e-4)
                    z = dev / np.sqrt(var / np.maximum(nn_, 1))
            for agg in aggs:
                for k in ks:
                    if not len(ps):
                        adj = 0
                    elif agg == "mean":
                        adj = ((nn_ / (nn_ + k)) * dev).mean(axis=0)
                    elif agg == "sum":
                        adj = ((nn_ / (nn_ + k)) * dev).sum(axis=0)
                    elif agg == "pooled":
                        nt = nn_.sum(axis=0)
                        adj = (nt / (nt + k)) * ((nn_ * dev).sum(axis=0) / np.maximum(nt, 1))
                    else:                                                                            # sel: clear profiles only
                        w = np.abs(z) > ZSEL
                        adj = np.where(w, (nn_ / (nn_ + k)) * dev, 0).sum(axis=0) / np.maximum(w.sum(axis=0), 1)
                    adj = np.clip(adj, -0.15, 0.15) if np.ndim(adj) else 0
                    br, ll, mar, _ = score(S, t, pg + (adj[c] if np.ndim(adj) else 0))
                    a = acc[(agg, k)]
                    a[0] += br - b_br; a[1] += ll - b_ll; a[2] += mar - b_mar
        # the slate's results enter the sums AFTER it is scored; recency: older evidence decays (half-life hl slates)
        if hl > 0:
            dk = 0.5 ** (1.0 / hl)
            gR *= dk; gN *= dk; pR *= dk; pQ *= dk; pN *= dk
        gR += R[t]; gN += N[t]
        ps_t = np.where(M[:, t])[0]
        if len(ps_t):
            pR[ps_t] += R[t]; pQ[ps_t] += Q[t]; pN[ps_t] += N[t]
    out = {key: (1e4 * v[0] / nlegs, 1e4 * v[1] / nlegs, 100 * v[2] / nsl) for key, v in acc.items()}
    return out, (1e4 * base[0] / nlegs, 1e4 * base[1] / nlegs, 100 * base[2] / nsl, nlegs, nsl)


def knn_run(S, R, Q, N, X, nns, ks, rand=False):
    D, C = R.shape
    gR = np.zeros(C); gN = np.zeros(C)
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    nlegs = 0; nsl = 0
    for t in range(D):
        if t >= max(WARM, max(nns)):
            c, p, h, f = S[t]
            g = np.where(gN > 0, gR / np.maximum(gN, 1), 0) * (gN / (gN + KG))
            pg = p + g[c]
            b_br, b_ll, b_mar, n = score(S, t, pg)
            nlegs += n; nsl += 1
            gm = np.where(gN > 0, gR / np.maximum(gN, 1), 0)
            if not rand:
                x = X[t]; ok = ~np.isnan(x)
                dist = np.sqrt(np.nanmean((X[:t][:, ok] - x[ok]) ** 2, axis=1))
                order = np.argsort(np.where(np.isnan(dist), np.inf, dist))
            for nn in nns:
                nb = RNG.choice(t, nn, replace=False) if rand else order[:nn]
                lr = R[nb].sum(axis=0); ln = N[nb].sum(axis=0)
                dev = np.where(ln > 0, lr / np.maximum(ln, 1) - gm, 0)
                for k in ks:
                    adj = np.clip((ln / (ln + k)) * dev, -0.15, 0.15)
                    br, ll, mar, _ = score(S, t, pg + adj[c])
                    a = acc[(nn, k)]
                    a[0] += br - b_br; a[1] += ll - b_ll; a[2] += mar - b_mar
        gR += R[t]; gN += N[t]
    return {key: (1e4 * v[0] / nlegs, 1e4 * v[1] / nlegs, 100 * v[2] / nsl) for key, v in acc.items()}


def ridge_run(S, R, N, X, lams, shift=0):
    """CONTEXT AS FEATURES (Gemini / 'feature, not state'): per cell, the residual is a linear function of the board's features
    (trailing percentiles, centred), fitted by ridge on all EARLIER slates (sufficient statistics per cell: sum n x x', sum R x);
    slate t's adjustment = x_t . beta_c. shift > 0: the feature rows are circularly shifted (the null - same features, wrong boards)"""
    D, C = R.shape
    Xc = np.nan_to_num(X - 0.5)                                       # trailing percentiles -> centred, missing -> neutral
    # compress to the top NPC principal axes of the FIRST 60 slates (no look-ahead; keeps the per-cell ridge small and stable)
    u, sv, vt = np.linalg.svd(Xc[:60] - Xc[:60].mean(axis=0), full_matrices=False)
    Xc = Xc @ vt[:NPC].T
    Xc = Xc / max(Xc[:60].std(), 1e-9)
    if shift:
        Xc = np.roll(Xc, shift, axis=0)
    F = Xc.shape[1]
    A = np.zeros((C, F, F)); B = np.zeros((C, F))
    gR = np.zeros(C); gN = np.zeros(C)
    acc = defaultdict(lambda: [0.0, 0.0, 0.0])
    nlegs = 0; nsl = 0
    eye = np.eye(F)
    for t in range(D):
        if t >= max(WARM, 30):
            c, p, h, f = S[t]
            gm = np.where(gN > 0, gR / np.maximum(gN, 1), 0)
            g = gm * (gN / (gN + KG))
            pg = p + g[c]
            b_br, b_ll, b_mar, n = score(S, t, pg)
            nlegs += n; nsl += 1
            x = Xc[t]
            # residual after the global recalibration: fit on (r - gm) implicitly via centred features (the intercept is gm)
            for lam in lams:
                beta = np.linalg.solve(A + lam * eye[None, :, :], B[..., None])[..., 0]
                adj = np.clip(beta @ x, -0.15, 0.15)
                br, ll, mar, _ = score(S, t, pg + adj[c])
                a = acc[lam]
                a[0] += br - b_br; a[1] += ll - b_ll; a[2] += mar - b_mar
        # sufficient statistics of slate t (after scoring): residual relative to the cell's running mean is what the features explain
        x = Xc[t]
        gm_now = np.where(gN > 0, gR / np.maximum(gN, 1), 0)
        A += N[t][:, None, None] * np.outer(x, x)[None, :, :]
        B += (R[t] - N[t] * gm_now)[:, None] * x[None, :]
        gR += R[t]; gN += N[t]
    return {key: (1e4 * v[0] / nlegs, 1e4 * v[1] / nlegs, 100 * v[2] / nsl) for key, v in acc.items()}


def report(title, real, nulls, keys, lab):
    from scipy.stats import norm
    print("\n" + "=" * 190 + f"\n{title}")
    print("  (Brier / log-loss: change x 1e4 per leg, NEGATIVE = better probabilities; margin: change of the top legs' realized margin, pts)")
    best = {"br": (None, 0), "mar": (None, -1e9)}
    for key in keys:
        r = real[key]
        nb = np.array([x[key][0] for x in nulls]); nm = np.array([x[key][2] for x in nulls])
        pb = float(norm.cdf((r[0] - nb.mean()) / max(nb.std(ddof=1), 1e-12))) if len(nb) > 2 else np.nan       # lower is better
        pm = float(norm.sf((r[2] - nm.mean()) / max(nm.std(ddof=1), 1e-12))) if len(nm) > 2 else np.nan
        print(f"  {lab(key):<22} Brier {r[0]:+8.3f} (null {nb.mean():+.3f} sd {nb.std():.3f}; p {pb:.4f}) | log-loss {r[1]:+8.3f} | "
              f"top-{TOP} margin {r[2]:+6.2f} (null {nm.mean():+.2f} sd {nm.std():.2f}; p {pm:.4f})")
        if r[0] < best["br"][1]:
            best["br"] = (key, r[0])
        if r[2] > best["mar"][1]:
            best["mar"] = (key, r[2])
    # multiple-setting correction: the best setting vs every null draw's best setting
    if nulls:
        kb, vb = best["br"]
        if kb is not None:
            nmin = np.array([min(x[k][0] for k in keys) for x in nulls])
            print(f"  BEST Brier {lab(kb)} {vb:+.3f}: share of null draws whose best setting is as good {np.mean(nmin <= vb):.3f}")
        km, vm = best["mar"]
        nmax = np.array([max(x[k][2] for k in keys) for x in nulls])
        print(f"  BEST margin {lab(km)} {vm:+.2f}: share of null draws whose best setting is as good {np.mean(nmax >= vm):.3f}")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    reg, days, order, seas = L1.build(conn)
    conn = psycopg.connect(os.environ["DATABASE_URL"])            # MLB runners kill connections idle > 2 minutes
    conn.execute("SET statement_timeout = 0")
    hist_ix = [i for i, k in enumerate(order) if k[0] in HIST]
    horder = [order[i] for i in hist_ix]
    S, cells = leg_arrays(days, horder)
    R, Q, N = slate_sums(S, len(cells))
    D = len(S)
    log(f"Layer 1: {len(reg.items)} profiles; {int(N.sum()):,} graded legs on {D} slates, {len(cells)} cells")
    masks_all = [it["mask"][hist_ix] for it in reg.items]
    sets = {"ALL PROFILES": list(range(len(masks_all))),
            "BOARD PROFILES": [i for i, it in enumerate(reg.items) if it["tech"] != "calendar"],
            "CALENDAR": [i for i, it in enumerate(reg.items) if it["tech"] == "calendar"]}
    if RIDGE:
        F_ = L1.slate_features(conn, days, order)
        cols = sorted({c for f in F_.values() for c in f})
        _, Pp = L1.trailing_pct(F_, order, cols)
        fam = L1.families(cols)
        Xr = Pp[:, [cols.index(c) for c in fam["ALL"]]][hist_ix]
        real = ridge_run(S, R, N, Xr, RIDGE)
        nulls = []
        for j in range(min(NULLN, 100)):
            nulls.append(ridge_run(S, R, N, Xr, RIDGE, shift=int(RNG.integers(20, D - 20))))
        report(f"CONTEXT AS FEATURES - per-cell ridge on the board's {Xr.shape[1]} ALL-family features (trailing percentiles), walk-forward, "
               f"vs {len(nulls)} feature-row shifts", real, nulls, sorted(real), lambda k: f"ridge lambda {k:g}")
        log("ridge read done")
        if ONLY_RIDGE:
            log("done (LC_ONLY_RIDGE)")
            return
    for (nm, ix), hl in [(x, h) for x in sets.items() for h in HLS]:
        masks = [masks_all[i] for i in ix]
        real, base = run_system(S, R, Q, N, masks, AGGS, KS, hl)
        nulls = []
        for j in range(NULLN):
            sh = [np.roll(m, int(RNG.integers(1, D))) for m in masks]
            nulls.append(run_system(S, R, Q, N, sh, AGGS, KS, hl)[0])
            if (j + 1) % 50 == 0:
                log(f"{nm}: {j + 1} null systems")
        tag = f"{nm}, half-life {hl:g} slates" if hl else nm
        print(f"\n[{tag}] global-only recalibration baseline: Brier {base[0]:.1f} / log-loss {base[1]:.1f} (x 1e4 per leg), top-{TOP} margin "
              f"{base[2]:+.2f} pts, on {base[3]:,} legs / {base[4]} slates")
        report(f"[{tag}] PROFILE CONTEXT AT THE LEG LEVEL vs the global-only recalibration ({NULLN} shifted-mask nulls)", real, nulls,
               sorted(real), lambda k: f"{k[0]} K {k[1]:g}")
    # look-alike
    F_ = L1.slate_features(conn, days, order)
    cols = sorted({c for f in F_.values() for c in f})
    _, Pp = L1.trailing_pct(F_, order, cols)
    fam = L1.families(cols)
    X = Pp[:, [cols.index(c) for c in fam["ALL"]]][hist_ix]
    real = knn_run(S, R, Q, N, X, KNN, KS)
    nulls = [knn_run(S, R, Q, N, X, KNN, KS, rand=True) for _ in range(min(NULLN, 100))]
    report(f"LOOK-ALIKE CONTEXT AT THE LEG LEVEL (nn most similar earlier slates vs nn random earlier slates, {len(nulls)} draws)", real,
           nulls, sorted(real), lambda k: f"nn {k[0]} K {k[1]:g}")
    log("done")


if __name__ == "__main__":
    main()
