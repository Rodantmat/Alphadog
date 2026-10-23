#!/usr/bin/env python3
"""
RESEARCH - RECALIBRATION v3: SHRINK OUR PROBABILITY TO WHAT IT IS WORTH, PER PROP x LINE TYPE x SIDE, ANCHORED ON PRIZEPICKS' OWN
LINE (2026-10-22 PT; owner 17:49 PT: "proper calibrate our demons, understand why they are so off and fix it, same for all other prop
lines ... replicated to full back history and the live pipeline"). READ-ONLY - measures candidate fixes, writes nothing.

WHY (research_calibration_audit.py run 39880546631): our final_hp is far too SPREAD OUT on every line type. 2025-26 standard legs:
final_hp 0.26 -> hit 0.43, final_hp 0.80 -> hit 0.58; goblins G1 0.15 -> 0.51, 0.80 -> 0.71; demons D2 0.13 -> 0.18, 0.78 -> 0.40. The
error is already in the baseline (bh ~ fh), not added by the enrichment; the as-of calibration shifts by baseline band but is blind
to the line type, so a demon priced like a 0.62 standard keeps 0.62 although demons that far above PrizePicks' line hit ~0.43.

CANDIDATES, fitted per cell (prop x line type R / G1-3 / D1-3 x side; shrunk toward (line type x side) by n / (n + K)):
  M0 raw final_hp
  M1 PLATT     logit p = a + b * logit(fh)
  M2 ANCHORED  logit p = a + b * logit(fh) + c * logit(q), q = PrizePicks' implied probability of the leg (1 / (2 x factor) for a
               Flex-neutral leg; the standard line q = 0.5) - the board's own price as an anchor
  M3 ISOTONIC  pool-adjacent-violators on fh, per cell (monotone, no shape assumption)
STAGES (owner's order): 1 SAMPLE 2025-26 first half -> second half; 2 SEASON 2024-25 -> 2025-26 and back; 3 TWO SEASONS leave one
month out. Per stage and model: log-loss, Brier, calibration error (mean |fh - hit| over 20 equal-mass bins), the top end (legs the
model calls >= .58: their mean p vs hit), per line type. A fix is adopted only if it beats M0 in EVERY stage, both directions.
Env: DATABASE_URL, RC_K (shrink pseudo-count, 400), RC_STAGES (1,2,3).
"""
import os
from collections import defaultdict

import numpy as np
import psycopg

SEASONS = ("2024-25", "2025-26")
PROPS = {"steals", "blocks", "stocks", "turnovers", "points", "pra", "pts_reb", "pts_ast", "rebounds", "reb_ast", "assists", "threes_made"}
K = float(os.environ.get("RC_K") or 400)
STAGES = [x for x in (os.environ.get("RC_STAGES") or "1,2,3").split(",") if x]
EPS = 1e-4


def logit(p):
    p = np.clip(p, EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sig(z):
    return 1.0 / (1.0 + np.exp(-z))


def fit_logistic(X, y, w=None, l2=1e-3, iters=50):
    """Newton-Raphson logistic regression with a tiny ridge; X includes the intercept column"""
    n, k = X.shape
    beta = np.zeros(k)
    w = np.ones(n) if w is None else w
    for _ in range(iters):
        p = sig(X @ beta)
        g = X.T @ (w * (y - p)) - l2 * beta
        H = -(X.T * (w * p * (1 - p))) @ X - l2 * np.eye(k)
        step = np.linalg.solve(H, g)
        beta = beta - step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def pav(x, y):
    """isotonic fit: returns (breakpoints x, fitted values) for monotone non-decreasing y on sorted x"""
    o = np.argsort(x)
    xs, ys = x[o], y[o].astype(float)
    vals, wts, xr = [], [], []
    for xi, yi in zip(xs, ys):
        vals.append(yi); wts.append(1.0); xr.append(xi)
        while len(vals) > 1 and vals[-2] > vals[-1]:
            v = (vals[-2] * wts[-2] + vals[-1] * wts[-1]) / (wts[-2] + wts[-1])
            wsum = wts[-2] + wts[-1]
            vals.pop(); wts.pop(); xr.pop()
            vals[-1], wts[-1] = v, wsum
    return np.array(xr), np.array(vals)


def iso_apply(model, x):
    xr, v = model
    idx = np.searchsorted(xr, x, side="right") - 1
    return np.clip(v[np.clip(idx, 0, len(v) - 1)], 0.02, 0.98)


def lt_of(tier):
    return "R" if tier == "R" else tier[:2]


def metrics(p, y):
    p = np.clip(p, EPS, 1 - EPS)
    ll = float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
    br = float(np.mean((p - y) ** 2))
    o = np.argsort(p)
    bins = np.array_split(o, 20)
    ece = float(np.mean([abs(p[b].mean() - y[b].mean()) for b in bins if len(b)]))
    top = p >= 0.58
    return ll, br, ece, (int(top.sum()), float(p[top].mean()) if top.any() else float("nan"), float(y[top].mean()) if top.any() else float("nan"))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    legs = {}
    for season, d, rk, pl, pr, sd, ln, t, sc, h, fac in conn.execute(
            """SELECT season, game_date, rank_key, player, prop, side, line::float8, tier, score, hit, factor
               FROM nba_score.tier_map_legs_sel_wo WHERE season = ANY(%s) AND hit IS NOT NULL""", (list(SEASONS),)):
        if pr not in PROPS:
            continue
        k = (season, d, pl, pr, sd, round(ln, 1), t)
        l = legs.setdefault(k, {"hit": int(h), "fac": float(fac or 1.0)})
        if rk == "final_hp":
            l["fh"] = float(sc)
    rows = [(k, v) for k, v in legs.items() if "fh" in v]
    print(f"graded legs: {len(rows):,}", flush=True)
    season = np.array([k[0] for k, _ in rows]); day = np.array([k[1] for k, _ in rows])
    prop = np.array([k[3] for k, _ in rows]); side = np.array([k[4] for k, _ in rows]); lt = np.array([lt_of(k[6]) for k, _ in rows])
    fh = np.array([v["fh"] for _, v in rows]); y = np.array([v["hit"] for _, v in rows], float)
    fac = np.array([v["fac"] for _, v in rows])
    q = np.clip(np.where(lt == "R", 0.5, 1.0 / (2.0 * np.maximum(fac, 0.3))), 0.05, 0.95)
    cell = np.array([f"{a}|{b}|{c}" for a, b, c in zip(prop, lt, side)])
    parent = np.array([f"{b}|{c}" for b, c in zip(lt, side)])
    print("line types: " + ", ".join(f"{t} {int((lt == t).sum()):,}" for t in sorted(set(lt))), flush=True)
    print("factor -> anchor q, per line type (mean): " + ", ".join(f"{t} fac {fac[lt == t].mean():.3f} q {q[lt == t].mean():.3f} hit {y[lt == t].mean():.3f}"
                                                              for t in sorted(set(lt))), flush=True)

    def fit_predict(tr, te):
        """fit every candidate on index tr, predict on te; returns dict model -> predictions on te"""
        out = {"M0 raw": fh[te]}
        for name, cols in (("M1 platt", lambda ix: np.column_stack([np.ones(ix.sum() if ix.dtype == bool else len(ix)), logit(fh[ix])])),
                           ("M2 anchored", lambda ix: np.column_stack([np.ones(ix.sum() if ix.dtype == bool else len(ix)), logit(fh[ix]), logit(q[ix])]))):
            pred = np.empty(len(te))
            pbeta = {}
            for pk in set(parent[tr]):
                m = tr[parent[tr] == pk]
                pbeta[pk] = fit_logistic(cols(m), y[m])
            for ck in set(cell[te]):
                mte = np.where(cell[te] == ck)[0]
                pk = parent[te][mte[0]]
                mtr = tr[cell[tr] == ck]
                bp = pbeta.get(pk)
                if bp is None:
                    pred[mte] = fh[te][mte]
                    continue
                if len(mtr) >= 30:
                    bc = fit_logistic(cols(mtr), y[mtr])
                    wgt = len(mtr) / (len(mtr) + K)
                    beta = wgt * bc + (1 - wgt) * bp
                else:
                    beta = bp
                pred[mte] = sig(cols(te[mte]) @ beta)
            out[name] = pred
        pred = np.empty(len(te))
        for ck in set(cell[te]):
            mte = np.where(cell[te] == ck)[0]
            mtr = tr[cell[tr] == ck]
            if len(mtr) < 200:
                mtr = tr[parent[tr] == parent[te][mte[0]]]
            if len(mtr) < 50:
                pred[mte] = fh[te][mte]
                continue
            pred[mte] = iso_apply(pav(fh[mtr], y[mtr]), fh[te][mte])
        out["M3 isotonic"] = pred
        return out

    def report(tag, tr, te):
        print(f"\n  {tag}: train {len(tr):,} legs, test {len(te):,}")
        preds = fit_predict(tr, te)
        res = {}
        for name, p in preds.items():
            ll, br, ece, top = metrics(p, y[te])
            res[name] = ll
            print(f"    {name:<12} log-loss {ll:.4f}  Brier {br:.4f}  calib err {ece:.4f}  top end (p >= .58) n {top[0]:>6} p {top[1]:.3f} hit {top[2]:.3f}")
            for t in ("R", "G1", "G2", "G3", "D1", "D2", "D3"):
                m = lt[te] == t
                if m.sum() < 200:
                    continue
                ll_t, _, ece_t, top_t = metrics(p[m], y[te][m])
                print(f"        {t:<3} n {int(m.sum()):>7}  log-loss {ll_t:.4f}  calib err {ece_t:.4f}  top n {top_t[0]:>6} p {top_t[1]:.3f} hit {top_t[2]:.3f}")
        return res

    idx = np.arange(len(rows))
    wins = defaultdict(list)
    if "1" in STAGES:
        print("\nSTAGE 1 - SAMPLE: 2025-26 first half -> second half")
        s = idx[season == "2025-26"]
        cut = np.sort(np.unique(day[s]))[len(np.unique(day[s])) // 2]
        r = report("2025-26 H1 -> H2", s[day[s] < cut], s[day[s] >= cut])
        for m, v in r.items():
            wins[m].append(v < r["M0 raw"] - 1e-5 if m != "M0 raw" else True)
    if "2" in STAGES:
        print("\nSTAGE 2 - SEASON: one season -> the other")
        for a, b in (SEASONS, SEASONS[::-1]):
            r = report(f"{a} -> {b}", idx[season == a], idx[season == b])
            for m, v in r.items():
                wins[m].append(v < r["M0 raw"] - 1e-5 if m != "M0 raw" else True)
    if "3" in STAGES:
        print("\nSTAGE 3 - TWO SEASONS: leave one month out")
        months = np.array([f"{d.year}-{d.month:02d}" for d in day])
        agg = defaultdict(lambda: [0.0, 0])
        for mo in sorted(set(months)):
            te = idx[months == mo]
            if len(te) < 2000:
                continue
            tr = idx[months != mo]
            preds = fit_predict(tr, te)
            for name, p in preds.items():
                ll = metrics(p, y[te])[0]
                agg[name][0] += ll * len(te); agg[name][1] += len(te)
                wins[name + " (months)"].append(ll < metrics(preds["M0 raw"], y[te])[0] - 1e-5 if name != "M0 raw" else True)
        for name, (s_, n) in agg.items():
            print(f"    {name:<12} pooled log-loss {s_ / n:.4f}")
    print("\nGATE - beats raw in every stage block:")
    for m, w in wins.items():
        if not m.startswith("M0"):
            print(f"  {m:<24} {sum(w)}/{len(w)} {'PASS' if all(w) else 'FAIL'}")


if __name__ == "__main__":
    main()
