#!/usr/bin/env python3
"""
PROOF SUITE FOR THE PER-LEG ROI MODEL (owner 2026-11-18 23:28 PT: "extremely deep understanding, simulation, backtest and proof of success before deployment").
READ-ONLY. Same data, loaders and walk-forward rule as research_leg_roi_model.py (everything fitted only on slates before the slate being scored).
Candidates:  BOARD   the board formula as deployed
             BLEND   model log-odds + price log-odds + side + kind + per-kind price slope + prop family (logistic, optional pull toward LP_PRIOR)
             FINAL-ISO / FINAL-LIN   BLEND with the top-leg correction: its raw ROI mapped to the real return of earlier legs, monotone (ISO) or straight line (LIN), per kind
Sections:
  1 HONESTY    slope of real on predicted (1.00 = honest), average gap, with 90% ranges from re-drawing whole slates (LP_BOOT draws)
  2 PICKING    real return of the top 5 legs a slate and of the legs rated positive; new minus board with 90% range and the share of draws where new wins
  3 STABILITY  predicted vs real of FINAL by leg kind, side, prop family, price band, and by month (does it decay?)
  4 SLIPS      slips built from each version's best legs (one leg a player, non-overlapping, 1 and 5 slips a slate), 2 to 6 picks, leg-compounded Power payout
               (product of the legs' own multipliers): predicted vs real
LP_SIM = 1   planted truth: results are re-drawn from a KNOWN hit chance; the suite must recover the true ROI (checks the code itself, no leak, no bias)
LP_SIM = 2   placebo: the model probability is shuffled inside each slate (it carries no information); the suite must give it ~zero weight and find no false edge
Env: DATABASE_URL, LR_APP, LR_BASE, LR_WARM, LR_STEP, LR_MAXM, LP_SIM, LP_BOOT (300), LP_PRIOR (comma list, BLEND coefficients to pull toward), LP_LAM (pull strength, 0),
LP_HALF (comma list of half-lives in slates: extra versions RECENT-h whose fit weights recent slates more and is pulled by LP_LAM toward the all-history fit).
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_leg_roi_model as R                         # noqa: E402

SIM = int(os.environ.get("LP_SIM") or 0)
BOOT = int(os.environ.get("LP_BOOT") or 300)
LAM = float(os.environ.get("LP_LAM") or 0)
SEASK = int(os.environ.get("LP_SEASON") or 0)
HALF = [float(x) for x in (os.environ.get("LP_HALF") or "").split(",") if x.strip()]
PRIOR = [float(x) for x in (os.environ.get("LP_PRIOR") or "").split(",") if x.strip()]
RNG = np.random.default_rng(20261118)
PP_A = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}
PP_E = {2: .904, 3: .936, 4: .969, 5: .986, 6: 1.0}
log = R.log; lg = R.lg; APP = R.APP; WARM = R.WARM; STEP = R.STEP


def fit(X, y, w0, lam, sw=None):
    w = w0.copy(); sw = np.ones(len(y)) if sw is None else sw
    for _ in range(50):
        p = 1 / (1 + np.exp(-X @ w)); W = sw * (p * (1 - p) + 1e-9)
        g = X.T @ (sw * (y - p)) - (lam + 1e-3) * (w - w0); H = (X * W[:, None]).T @ X + (lam + 1e-3) * np.eye(X.shape[1])
        step = np.linalg.solve(H, g); w = w + step
        if np.abs(step).max() < 1e-7:
            break
    return w


def iso_fit(raw, ret, nb=120):
    """Monotone map raw ROI -> real return, linear between block centres (no flat ties at the top)."""
    if len(raw) < 1500:
        return None
    nb = int(min(nb, max(10, len(raw) // 150)))
    q = np.quantile(raw, np.linspace(0, 1, nb + 1)[1:-1]); b = np.searchsorted(q, raw)
    cnt = np.bincount(b, minlength=nb).astype(float); ok = cnt > 0
    xm = np.bincount(b, weights=raw, minlength=nb)[ok] / cnt[ok]; ym = np.bincount(b, weights=ret, minlength=nb)[ok] / cnt[ok]
    o = np.argsort(xm); xm, ym, c = xm[o], ym[o], cnt[ok][o]
    vals, wts, xs = [], [], []
    for xi, yi, wi in zip(xm, ym, c):
        vals.append(yi); wts.append(wi); xs.append(xi * wi)
        while len(vals) > 1 and vals[-2] > vals[-1]:
            tw = wts[-2] + wts[-1]
            vals[-2] = (vals[-2] * wts[-2] + vals[-1] * wts[-1]) / tw; xs[-2] += xs[-1]; wts[-2] = tw
            vals.pop(); wts.pop(); xs.pop()
    cx = np.array(xs) / np.array(wts); cv = np.array(vals)
    return lambda r: np.interp(r, cx, cv) + 1e-4 * (r - np.clip(r, cx[0], cx[-1]))


def lin_fit(raw, ret):
    if len(raw) < 800:
        return None
    lo, hi = np.quantile(raw, [.005, .995]); x = np.clip(raw, lo, hi)
    xc = x - x.mean(); b = (xc * ret).sum() / max(1e-12, (xc * xc).sum()); a = ret.mean() - b * x.mean()
    b = float(np.clip(b, 0.0, 1.5))
    a = ret.mean() - b * x.mean()
    return lambda r: a + b * np.clip(r, lo - .2, hi + .2)


def slate_stats(roi, rr, dd, nd, qedges):
    """Per-slate pieces so whole slates can be re-drawn: bins for the slope, top 5, rated positive."""
    b = np.searchsorted(qedges, roi); nb = len(qedges) + 1
    key = dd * nb + b
    cnt = np.bincount(key, minlength=nd * nb).reshape(nd, nb).astype(float)
    sx = np.bincount(key, weights=roi, minlength=nd * nb).reshape(nd, nb); sy = np.bincount(key, weights=rr, minlength=nd * nb).reshape(nd, nb)
    order = np.lexsort((-roi, dd)); d_o = dd[order]
    first = np.r_[True, d_o[1:] != d_o[:-1]]; rank = np.arange(len(d_o)) - np.maximum.accumulate(np.where(first, np.arange(len(d_o)), 0))
    t5 = order[rank < 5]
    top = np.zeros((nd, 3)); np.add.at(top, (dd[t5], 0), rr[t5]); np.add.at(top, (dd[t5], 1), 1.0); np.add.at(top, (dd[t5], 2), roi[t5])
    pos = roi > 0
    ps = np.zeros((nd, 3)); np.add.at(ps, (dd[pos], 0), rr[pos]); np.add.at(ps, (dd[pos], 1), 1.0); np.add.at(ps, (dd[pos], 2), roi[pos])
    return cnt, sx, sy, top, ps


def summarize(S, idx):
    cnt, sx, sy, top, ps = S
    c = cnt[idx].sum(0); ok = c > 0
    xm = sx[idx].sum(0)[ok] / c[ok]; ym = sy[idx].sum(0)[ok] / c[ok]
    xc = xm - np.average(xm, weights=c[ok]); slope = (c[ok] * xc * ym).sum() / max(1e-12, (c[ok] * xc * xc).sum())
    gap = np.average(np.abs(xm - ym), weights=c[ok])
    t = top[idx].sum(0); p = ps[idx].sum(0)
    return np.array([slope, gap, t[0] / max(1, t[1]), t[2] / max(1, t[1]), p[0] / max(1, p[1]), p[2] / max(1, p[1]), p[1] / len(idx)])


def rng90(a):
    return f"[{np.percentile(a, 5):+.3f} .. {np.percentile(a, 95):+.3f}]"


def pct90(a):
    return f"[{100 * np.percentile(a, 5):+5.1f}% .. {100 * np.percentile(a, 95):+5.1f}%]"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    df, KP, WB, GAPFIX = R.load_pp(conn) if APP == "prizepicks" else R.load_app(conn)
    try:
        conn.close()
    except Exception:
        pass
    keep = ((df["m"] < R.MAXM) & (df["m"] > 1.0)).values
    df = df[keep]; KP = KP[keep]; WB = WB[keep]; GAPFIX = GAPFIX[keep] if GAPFIX is not None else None
    o_ = np.argsort(df["game_date"].values, kind="stable")
    df = df.iloc[o_].reset_index(drop=True); KP = KP[o_]; WB = WB[o_]; GAPFIX = GAPFIX[o_] if GAPFIX is not None else None
    days = np.array(sorted(df["game_date"].unique())); didx = {d: i for i, d in enumerate(days)}
    di = df["game_date"].map(didx).values.astype(int)
    kind = df["kind"].values; KINDS = [k for k in ("standard", "goblin", "demon", "alt") if (kind == k).any()]
    m = df["m"].values; be = df["be"].values; ov = df["over"].values; hp = df["hp"].values.copy()
    isg = np.isin(kind, ["goblin", "alt"]).astype(float); isd = (kind == "demon").astype(float); one = np.ones(len(df))
    combo = df["prop"].isin(R.COMBO).astype(float).values; lowc = df["prop"].isin(R.LOWC).astype(float).values
    y = df["hit"].values.astype(float)
    p_true = None
    if SIM == 1:
        z = RNG.normal(0, 1, len(df))
        p_true = 1 / (1 + np.exp(-(-0.10 + 0.30 * lg(hp) + 0.55 * lg(be) - 0.20 * isd + 0.05 * ov + 0.20 * z)))
        y = (RNG.random(len(df)) < p_true).astype(float)
        log("LP_SIM=1 PLANTED TRUTH: results re-drawn from hit chance = logistic(-0.10 + 0.30 model + 0.55 price - 0.20 demon + 0.05 over + hidden noise)")
    elif SIM == 2:
        for d in range(len(days)):
            ix = np.flatnonzero(di == d); hp[ix] = hp[ix][RNG.permutation(len(ix))]
        log("LP_SIM=2 PLACEBO: model probability shuffled inside every slate")
    ret = y * m - 1
    lhp = lg(hp); lbe = lg(be)
    X = np.column_stack([one, lhp, lbe, ov, isg, isd, lbe * isg, lbe * isd, lhp * isg, lhp * isd, ov * isg, combo, lowc, lowc * isd])
    w0 = np.zeros(X.shape[1])
    if PRIOR:
        w0[:len(PRIOR)] = PRIOR[:X.shape[1]]
    log(f"{APP} legs {len(df):,} on {len(days)} slates {days[0]} .. {days[-1]}; warm-up {WARM}, refit every {STEP}; parameters {X.shape[1]}; pull {LAM} toward {PRIOR or 'none'}")
    pB = np.full(len(df), np.nan); pN = np.full(len(df), np.nan); coefs = []
    pH = {h: np.full(len(df), np.nan) for h in HALF}; coefH = {h: [] for h in HALF}
    pS = np.full(len(df), np.nan); coefS = []; sea_all = df["season"].values
    hb = np.clip(np.floor(hp * 20), 0, 19).astype(int)
    for start in range(WARM, len(days), STEP):
        tr = di < start; te = (di >= start) & (di < start + STEP)
        if not te.any():
            continue
        if GAPFIX is None:
            g = pd.Series(y[tr] - hp[tr]).groupby([kind[tr], ov[tr], hb[tr]]).mean().to_dict()
            gap = np.array([g.get((k, o, b), 0.0) for k, o, b in zip(kind[te], ov[te], hb[te])])
        else:
            gap = GAPFIX[te]
        pc = np.clip(hp[te] + gap, .005, .995)
        pB[te] = np.clip(pc + WB[te] * (np.minimum(.99, KP[te] * be[te]) - pc), .005, .995)
        wv = fit(X[tr], y[tr], w0, LAM); pN[te] = 1 / (1 + np.exp(-X[te] @ wv)); coefs.append(wv)
        if SEASK:                                             # this season only once it has SEASK slates behind it, pulled toward the all-history fit by LP_LAM
            cur = sea_all[te][0]; trs = tr & (sea_all == cur)
            ws = fit(X[trs], y[trs], wv, LAM) if len(set(di[trs])) >= SEASK else wv
            pS[te] = 1 / (1 + np.exp(-X[te] @ ws)); coefS.append(ws)
        for H_ in HALF:                                       # recent slates count more (half-life H_ slates), pulled toward the all-history fit by LP_LAM
            sw = 0.5 ** ((start - 1 - di[tr]) / H_)
            wh = fit(X[tr], y[tr], wv, LAM, sw); pH[H_][te] = 1 / (1 + np.exp(-X[te] @ wh)); coefH[H_].append(wh)
    coefs = np.array(coefs)
    names = ["const", "model", "price", "over", "gob/alt", "demon", "price*gob", "price*dem", "model*gob", "model*dem", "over*gob", "combo", "lowcount", "lowc*dem"]
    print("LP|BLEND coefficients (first fit / last fit / spread across fits): " + "; ".join(
        f"{n} {coefs[0][i]:+.2f}/{coefs[-1][i]:+.2f}/{coefs[:, i].std():.2f}" for i, n in enumerate(names)), flush=True)
    print("LP|LAST_COEF=" + ",".join(f"{v:.4f}" for v in coefs[-1]), flush=True)
    scored = np.isfinite(pN); rawN = pN * m - 1
    fI = np.full(len(df), np.nan); fL = np.full(len(df), np.nan)
    for start in range(2 * WARM, len(days), STEP):
        tr = scored & (di < start); te = (di >= start) & (di < start + STEP)
        if not te.any():
            continue
        for k in KINDS:
            a = tr & (kind == k); b = te & (kind == k)
            if not b.any():
                continue
            fi = iso_fit(rawN[a], ret[a]); fl = lin_fit(rawN[a], ret[a])
            if fi is None or fl is None:                      # too few legs of this kind yet: fall back to all kinds together
                fi = fi or iso_fit(rawN[tr], ret[tr]); fl = fl or lin_fit(rawN[tr], ret[tr])
            fI[b] = fi(rawN[b]) if fi else rawN[b]; fL[b] = fl(rawN[b]) if fl else rawN[b]
    ev = np.isfinite(fI) & np.isfinite(fL)
    V = {"BOARD": pB * m - 1, "BLEND": rawN, "FINAL-ISO": fI, "FINAL-LIN": fL}
    if SEASK:
        V["SEASON"] = pS * m - 1; c = np.array(coefS)
        print("LP|SEASON model / price weight by fit: " + " ".join(f"{a:+.2f}/{b:+.2f}" for a, b in c[:: max(1, len(c) // 20), 1:3]), flush=True)
    for h in HALF:
        V[f"RECENT-{h:g}"] = pH[h] * m - 1; c = np.array(coefH[h])
        print(f"LP|RECENT-{h:g} model / price weight by fit: " + " ".join(f"{a:+.2f}/{b:+.2f}" for a, b in c[:: max(1, len(c) // 14), 1:3]), flush=True)
    c = coefs
    print("LP|BLEND (all history) model / price weight by fit: " + " ".join(f"{a:+.2f}/{b:+.2f}" for a, b in c[:: max(1, len(c) // 14), 1:3]), flush=True)
    dsc = np.unique(di[ev]); remap = {d: i for i, d in enumerate(dsc)}; dd = np.array([remap[d] for d in di[ev]]); nd = len(dsc)
    rr = ret[ev]; yy = y[ev]; mm = m[ev]; kk = kind[ev]
    log(f"scored {int(ev.sum()):,} legs on {nd} slates; hit {yy.mean():.3f}; all legs return {100 * rr.mean():+.1f}%")
    # ---------- 1 + 2: honesty and picking with slate re-draws
    draws = [RNG.integers(0, nd, nd) for _ in range(BOOT)]
    allidx = np.arange(nd); res = {}; bt = {}
    for name, roi_all in V.items():
        roi = roi_all[ev]; qe = np.quantile(roi, np.linspace(0, 1, 41)[1:-1])
        S = slate_stats(roi, rr, dd, nd, qe)
        res[name] = summarize(S, allidx); bt[name] = np.array([summarize(S, ix) for ix in draws])
    print(f"\nLP|=== 1 HONESTY - {APP.upper()}{' (PLANTED TRUTH)' if SIM == 1 else ' (PLACEBO)' if SIM == 2 else ''}: slope of real on predicted, 1.00 = honest; 90% range from re-drawing slates ===")
    for name in V:
        r = res[name]; b = bt[name]
        print(f"LP|{name:10s} slope {r[0]:5.2f} {rng90(b[:, 0])} | average gap {100 * r[1]:4.1f} pts {pct90(b[:, 1])}", flush=True)
    print(f"\nLP|=== 2 PICKING - {APP.upper()}: real return of the legs each version likes most ===")
    for name in V:
        r = res[name]; b = bt[name]
        print(f"LP|{name:10s} top 5 a slate: predicted {100 * r[3]:+6.1f}% real {100 * r[2]:+6.1f}% {pct90(b[:, 2])} | rated positive: {r[6]:6.1f} legs a slate, "
              f"predicted {100 * r[5]:+5.1f}% real {100 * r[4]:+5.1f}% {pct90(b[:, 4])}", flush=True)
    for name in [k for k in V if k != "BOARD"]:
        d5 = bt[name][:, 2] - bt["BOARD"][:, 2]; dp = bt[name][:, 4] - bt["BOARD"][:, 4]
        print(f"LP|{name:10s} minus BOARD: top 5 a slate {100 * (res[name][2] - res['BOARD'][2]):+6.1f} pts {pct90(d5)}, better in {100 * (d5 > 0).mean():3.0f}% of draws | "
              f"rated-positive legs {100 * (res[name][4] - res['BOARD'][4]):+6.1f} pts {pct90(dp)}, better in {100 * (dp > 0).mean():3.0f}% of draws", flush=True)
    seas = df["season"].values[ev]; sea_of = {}
    for s_, d_ in zip(seas, dd):
        sea_of[d_] = s_
    sea_arr = np.array([sea_of[i] for i in range(nd)])
    print(f"\nLP|=== 2b BY SEASON - {APP.upper()}: slope | top 5 a slate predicted -> real | rated positive (legs a slate) predicted -> real ===")
    for sname in sorted(set(sea_arr)):
        idx = np.flatnonzero(sea_arr == sname)
        for name, roi_all in V.items():
            roi = roi_all[ev]; qe = np.quantile(roi, np.linspace(0, 1, 41)[1:-1]); r = summarize(slate_stats(roi, rr, dd, nd, qe), idx)
            print(f"LP|  {sname} ({len(idx):3d} slates) {name:10s} slope {r[0]:5.2f} | top 5: {100 * r[3]:+6.1f}% -> {100 * r[2]:+6.1f}% | positive ({r[6]:6.1f}): {100 * r[5]:+5.1f}% -> {100 * r[4]:+5.1f}%", flush=True)
    if SIM == 1:
        tr_roi = (p_true * m - 1)[ev]
        print("\nLP|=== PLANTED TRUTH CHECK: predicted ROI against the TRUE ROI that generated the results ===")
        for name, roi_all in V.items():
            roi = roi_all[ev]; qe = np.quantile(roi, np.linspace(0, 1, 41)[1:-1]); b = np.searchsorted(qe, roi)
            c = np.bincount(b, minlength=40).astype(float); xm = np.bincount(b, weights=roi, minlength=40) / c; tm = np.bincount(b, weights=tr_roi, minlength=40) / c
            xc = xm - np.average(xm, weights=c); sl = (c * xc * tm).sum() / (c * xc * xc).sum()
            o = np.argsort(-roi)[:max(1, len(roi) // 100)]; pos = roi > 0
            print(f"LP|{name:10s} slope of TRUE on predicted {sl:5.2f} | average gap {100 * np.average(np.abs(xm - tm), weights=c):4.1f} pts | top 1% of legs: predicted "
                  f"{100 * roi[o].mean():+6.1f}% TRUE {100 * tr_roi[o].mean():+6.1f}% | rated positive: predicted {100 * roi[pos].mean() if pos.any() else 0:+5.1f}% "
                  f"TRUE {100 * tr_roi[pos].mean() if pos.any() else 0:+5.1f}% ({int(pos.sum()):,} legs; truly positive legs exist: {int((tr_roi > 0).sum()):,})", flush=True)
    # ---------- 3: stability of FINAL by group and by month
    fam = np.where(df["prop"].isin(R.COMBO).values, "combo", np.where(df["prop"].isin(R.LOWC).values, "low-count", "main stat"))[ev]
    side = np.where(ov[ev] > 0, "over/more", "under/less")
    band = np.select([mm < 1.5, mm < 1.9, mm < 2.6, mm < 4.0], ["pays under 1.5x", "1.5 - 1.9x", "1.9 - 2.6x", "2.6 - 4x"], "4x and over")
    month = np.array([str(d)[:7] for d in df["game_date"].values[ev]])
    for fname in ("FINAL-ISO", "FINAL-LIN"):
        roi = V[fname][ev]
        print(f"\nLP|=== 3 STABILITY - {APP.upper()} {fname}: predicted vs real by group (all legs of the group | legs rated positive) ===")
        for gname, garr in (("kind", kk), ("side", side), ("prop family", fam), ("price", band), ("month", month)):
            for gv in sorted(set(garr)):
                s_ = garr == gv
                if s_.sum() < 300:
                    continue
                daily = pd.DataFrame({"r": rr[s_] - roi[s_], "d": dd[s_]}).groupby("d")["r"].agg(["sum", "count"])
                se = np.sqrt(((daily["sum"] - daily["sum"].sum() / daily["count"].sum() * daily["count"]) ** 2).sum()) / daily["count"].sum()
                ps_ = s_ & (roi > 0)
                print(f"LP|  {gname:11s} {str(gv):16s} legs {int(s_.sum()):8,} predicted {100 * roi[s_].mean():+6.1f}% real {100 * rr[s_].mean():+6.1f}% (miss {100 * (rr[s_] - roi[s_]).mean():+5.1f} +- {100 * se:3.1f}) | "
                      f"positive {int(ps_.sum()):7,}: predicted {100 * roi[ps_].mean() if ps_.any() else 0:+5.1f}% real {100 * rr[ps_].mean() if ps_.any() else 0:+6.1f}%", flush=True)
    # ---------- 4: slips
    pl = df["player"].astype(str).values[ev]
    print(f"\nLP|=== 4 SLIPS - {APP.upper()}: slips from each version's best legs (one leg a player, non-overlapping). Payout = {'real Power table x (leg prices)^e' if APP == 'prizepicks' else 'product of the legs own multipliers'} ===")
    for name in V:
        roi = V[name][ev]; order = np.lexsort((-roi, dd)); bounds = np.flatnonzero(np.r_[True, dd[order][1:] != dd[order][:-1], True])
        picks = []
        for a_, b_ in zip(bounds[:-1], bounds[1:]):
            seen = set(); sel = []
            for i in order[a_:b_]:
                if pl[i] in seen:
                    continue
                seen.add(pl[i]); sel.append(i)
                if len(sel) >= 30:
                    break
            picks.append(sel)
        for nslips, lab in ((1, "best slip a slate"), (5, "5 slips a slate")):
            out = []
            for n in range(2, 7):
                rows = []
                for d_, sel in enumerate(picks):
                    for j in range(nslips):
                        s_ = sel[j * n:(j + 1) * n]
                        if len(s_) < n:
                            break
                        if APP == "prizepicks":                       # the real Power table with the 2026-11-18 alternate-leg law: A_n x (product of leg prices)^e_n
                            pay = PP_A[n] * float(np.prod(mm[s_] * R.BASE)) ** PP_E[n]
                            pred = float(np.prod((1 + roi[s_]) / mm[s_])) * pay - 1; real = (pay if yy[s_].all() else 0.0) - 1
                        else:
                            pred = np.prod(1 + roi[s_]) - 1; real = np.prod(yy[s_] * mm[s_]) - 1
                        rows.append((d_, pred, real, float(yy[s_].all())))
                a = np.array(rows)
                daily = pd.DataFrame({"r": a[:, 2], "d": a[:, 0]}).groupby("d")["r"].agg(["sum", "count"])
                tot = daily["sum"].sum() / daily["count"].sum(); se = np.sqrt(((daily["sum"] - tot * daily["count"]) ** 2).sum()) / daily["count"].sum()
                out.append(f"{n}-pick: predicted {100 * a[:, 1].mean():+6.1f}% real {100 * tot:+6.1f}% +-{100 * se:4.1f} (wins {100 * a[:, 3].mean():4.1f}%, {len(a):,} slips)")
            print(f"LP|{name:10s} {lab:18s} | " + " | ".join(out), flush=True)
    log("DONE")


if __name__ == "__main__":
    main()
