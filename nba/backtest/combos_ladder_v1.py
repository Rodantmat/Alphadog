#!/usr/bin/env python3
"""
NBA Backtest — Step 3: COMBOS (P+R, P+A, R+A, PRA, stocks, fantasy) and DOUBLE-DOUBLE on top of the
calibrated component projections (from classification_ladder_v12.py with BT_SAVE_COMPONENTS=1).

Design §5: combos via the joint structure of the components, never a direct fit.
  combo mean = sum w_i * mu_i ; combo var = sum w_i^2 var_i + 2 sum w_i w_j rho_ij sd_i sd_j
  rho_ij = the PLAYER's own backward-looking correlation (rolling 30, shift 1), shrunk toward the
  role-tier population correlation with k=20 games.  Fantasy = 1/1.2/1.5/3/3/-1 (same scale all 3 apps).
  Then the SAME recipe as single stats: tiers within role tier, hierarchical empirical tables rebuilt
  monthly (walk-forward), replacement mode, per-rung Platt, leg-level report.
  Double-double: P(at least two of P/R/A >= 10) via a Gaussian copula on CALIBRATED component marginals
  (post-Platt P(over 9.5) from the single-stat run) with the player's rho and the exact trivariate term.

FIRST RESULTS (2026-09-09, 2025-26, history 2023-24+2024-25):
  ladders: pts_reb 0.8 / pts_ast 1.1 / reb_ast 0.7 / pra 1.1 / stocks 1.6 / fantasy 1.0 pp
  confidence bands (n>=1000): 163 checked, 4 over 2.5pp (reb_ast 50-55 -3.6; stocks 60-65 -3.6, less 55-60 +3.1, 90-95 +2.8)
  population rho(points,rebounds) by role (train): IRON_MAN 0.13, HUS 0.22, STARTER 0.23, ROTATION 0.28, BENCH 0.35, FRINGE 0.46
    (minutes-driven covariance grows as playing time gets volatile - the archetype dependence the design predicted)
  double-double: with Normal marginals the copula over-predicted real candidates (60-70% band -> 56.5 actual) and the
    product approximation of the triple term under-subtracted for triple-double players (sum>1 -> 0.99 vs 0.82).
    With calibrated marginals + exact trivariate term: every band with n>=300 within +/-1.4pp except 0.2-0.3 (-3.9);
    0.6+ bands n=98/40/13/3 (noise).
Run AFTER classification_ladder_v12.py with BT_SAVE_COMPONENTS=1 for points,rebounds / assists,steals / blocks,turnovers.
"""
import json, math, os
from datetime import date
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats

OUT = Path("nba/backtest/reports"); TEST = os.environ.get("BT_TEST", "2025-26"); TRAIN = os.environ.get("BT_TRAIN", "2023-24,2024-25").split(",")
COMPS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers"]
W = {"pts_reb": {"points": 1, "rebounds": 1}, "pts_ast": {"points": 1, "assists": 1}, "reb_ast": {"rebounds": 1, "assists": 1},
     "pra": {"points": 1, "rebounds": 1, "assists": 1}, "stocks": {"steals": 1, "blocks": 1},
     "fantasy_score": {"points": 1, "rebounds": 1.2, "assists": 1.5, "blocks": 3, "steals": 3, "turnovers": -1}}
MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL = 24, 15, 5, 6, 300, 300.0
BT_PROPS = os.environ.get("BT_PROPS", "")

dfs = []
for c in COMPS:
    p = pd.read_pickle(OUT / f"_comp_{c}_{TEST}.pkl")
    p = p.rename(columns={"proj_mean": f"mu_{c}", "proj_var": f"var_{c}", "actual": f"y_{c}", "tier": f"tier_{c}"}).drop(columns=["anchor"])
    dfs.append(p if not dfs else p[["season", "PLAYER_ID", "GAME_ID", f"mu_{c}", f"var_{c}", f"y_{c}", f"tier_{c}"]])
d = dfs[0]
for p in dfs[1:]: d = d.merge(p, on=["season", "PLAYER_ID", "GAME_ID"], how="inner")
d = d.sort_values(["season", "PLAYER_ID", "GAME_DATE"]).reset_index(drop=True)
print("joined component rows:", len(d))

pairs = [(a, b) for i, a in enumerate(COMPS) for b in COMPS[i + 1:]]
g = d.groupby(["season", "PLAYER_ID"])
for a, b in pairs:
    d[f"rho_{a}_{b}"] = g.apply(lambda x: x[f"y_{a}"].shift(1).rolling(30, min_periods=12).corr(x[f"y_{b}"].shift(1))).reset_index(level=[0, 1], drop=True)
    d[f"n_{a}_{b}"] = g[f"y_{a}"].transform(lambda x: x.shift(1).notna().cumsum()).clip(upper=30)
tr = d[d["season"].isin(TRAIN)]
for a, b in pairs:
    pop = tr.groupby("role_tier").apply(lambda x: x[f"y_{a}"].corr(x[f"y_{b}"])).to_dict()
    prior = d["role_tier"].map(pop).fillna(0.0)
    n = d[f"n_{a}_{b}"].fillna(0)
    d[f"rho_{a}_{b}"] = (n * d[f"rho_{a}_{b}"].fillna(0) + 20.0 * prior) / (n + 20.0)
print("population rho by role (train), points-rebounds:", {k: round(v, 3) for k, v in tr.groupby("role_tier").apply(lambda x: x["y_points"].corr(x["y_rebounds"])).items()})

def combo_mv(prop):
    w = W[prop]; comps = list(w)
    mu = sum(w[c] * d[f"mu_{c}"] for c in comps)
    var = sum(w[c] ** 2 * d[f"var_{c}"] for c in comps)
    for i, a in enumerate(comps):
        for b in comps[i + 1:]:
            key = f"rho_{a}_{b}" if f"rho_{a}_{b}" in d.columns else f"rho_{b}_{a}"
            var = var + 2 * w[a] * w[b] * d[key] * np.sqrt(d[f"var_{a}"] * d[f"var_{b}"])
    y = sum(w[c] * d[f"y_{c}"] for c in comps)
    return mu, np.maximum(var, mu.abs() * 0.5 + 1e-6), y

def nb_cdf(k, mean, var):
    if mean <= 0: return 1.0
    if var <= mean * 1.02: return float(stats.poisson.cdf(k, mean))
    r = mean * mean / (var - mean); p = r / (r + mean); return float(stats.nbinom.cdf(k, r, p))

def logit(p): p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))
def sigmoid(x): return 1 / (1 + np.exp(-x))
def fit_platt(p, y, iters=25):
    x = logit(p); A, B = 1.0, 0.0
    for _ in range(iters):
        z = A * x + B; q = sigmoid(z); w = q * (1 - q) + 1e-9
        gA = np.sum((q - y) * x); gB = np.sum(q - y); hAA = np.sum(w * x * x); hAB = np.sum(w * x); hBB = np.sum(w)
        det = hAA * hBB - hAB * hAB
        if det <= 1e-12: break
        dA = (hBB * gA - hAB * gB) / det; dB = (hAA * gB - hAB * gA) / det; A -= dA; B -= dB
    return A, B

VB = {"pts_reb": [(0, 12.5, "LOW"), (12.5, 22.5, "MID"), (22.5, 32.5, "HIGH"), (32.5, 99, "ELITE")],
      "pts_ast": [(0, 10.5, "LOW"), (10.5, 20.5, "MID"), (20.5, 30.5, "HIGH"), (30.5, 99, "ELITE")],
      "reb_ast": [(0, 5.5, "LOW"), (5.5, 10.5, "MID"), (10.5, 15.5, "HIGH"), (15.5, 99, "ELITE")],
      "pra": [(0, 14.5, "LOW"), (14.5, 24.5, "MID"), (24.5, 34.5, "HIGH"), (34.5, 99, "ELITE")],
      "stocks": [(0, 1.1, "LOW"), (1.1, 2.1, "MID"), (2.1, 99, "HIGH")],
      "fantasy_score": [(0, 17.5, "LOW"), (17.5, 29.5, "MID"), (29.5, 42.5, "HIGH"), (42.5, 999, "ELITE")]}
d["ym"] = pd.to_datetime(d["GAME_DATE"]).dt.to_period("M")
reliab = []
for prop in W:
    if BT_PROPS and prop not in BT_PROPS.split(","): continue
    mu, var, y = combo_mv(prop)
    x = d[["season", "PLAYER_ID", "GAME_ID", "GAME_DATE", "role_tier", "proj_min", "ym"]].copy()
    x["mu"], x["var"], x["y"] = mu.values, var.values, y.values
    x = x[x["mu"].notna() & (x["proj_min"] >= 8)].copy()
    x["rate36"] = x["mu"] / x["proj_min"] * 36
    x["ym_s"] = x["ym"].astype(str)
    tp = {}
    for (s, ym, role), grp in x.groupby(["season", "ym_s", "role_tier"]):
        pop = grp.groupby("PLAYER_ID")["rate36"].last(); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))
        ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)
        for pid, t in tier_of.items(): tp[(s, ym, role, pid)] = int(t)
    x["tier"] = [tp.get((s, y_, r, p)) for s, y_, r, p in zip(x["season"], x["ym_s"], x["role_tier"], x["PLAYER_ID"])]
    x["anchor"] = np.floor(x["mu"]) + 0.5
    x["var_band"] = [next((k for lo, hi, k in VB[prop] if lo <= a < hi), "ELITE") for a in x["anchor"]]
    test_all = x[x["season"] == TEST]
    for month, test in test_all.groupby("ym"):
        hist = x[(x["season"].isin(TRAIN) | (x["ym"] < month)) & x["tier"].notna()]
        emp, emp2, emp3 = {}, {}, {}
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line_tr = (hist["anchor"] + off).clip(lower=0.5); hit = (hist["y"] > line_tr).astype(int)
            key = pd.DataFrame({"t": hist["tier"].values, "r": hist["role_tier"].values, "v": hist["var_band"].values, "hit": hit.values})
            for (t, r), row in key.groupby(["t", "r"])["hit"].agg(["mean", "count"]).iterrows():
                if row["count"] >= EMP_MIN: emp[(int(t), r, off)] = (float(row["mean"]), int(row["count"]))
            for (v, r), row in key.groupby(["v", "r"])["hit"].agg(["mean", "count"]).iterrows():
                if row["count"] >= EMP_MIN: emp2[(v, r, off)] = (float(row["mean"]), int(row["count"]))
            for v, row in key.groupby("v")["hit"].agg(["mean", "count"]).iterrows():
                if row["count"] >= EMP_MIN: emp3[(v, off)] = (float(row["mean"]), int(row["count"]))
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line = (test["anchor"] + off).clip(lower=0.5); k_int = np.floor(line).astype(int)
            if prop == "stocks":
                p_under = np.array([nb_cdf(kk, m, v) for kk, m, v in zip(k_int, test["mu"], test["var"])])
            else:
                p_under = stats.norm.cdf(line, test["mu"], np.sqrt(test["var"]))
            p_param = 1 - p_under
            p_over = np.array(p_param, dtype=float); used = np.zeros(len(test), dtype=bool)
            t_arr = [int(t) if t is not None and not (isinstance(t, float) and np.isnan(t)) else -1 for t in test["tier"]]
            for i, (t, r, v) in enumerate(zip(t_arr, test["role_tier"], test["var_band"])):
                base = p_param[i]
                for c in (emp3.get((v, off)), emp2.get((v, r, off)), emp.get((t, r, off))):
                    if not c: continue
                    used[i] = True; base = (c[1] * c[0] + K_CELL * base) / (c[1] + K_CELL)
                p_over[i] = base
            reliab.append(pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test["y"] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))
    print(prop, "done")
rel = pd.concat(reliab, ignore_index=True)
rel["p_raw"] = rel["p_over"].copy(); rel["month_dt"] = pd.PeriodIndex(rel["month"], freq="M")
_pools = {k: g_ for k, g_ in rel.groupby(["prop", "var_band", "offset"])}
for (prop, vb, role, off), grp in rel.groupby(["prop", "var_band", "role_tier", "offset"]):
    pool_all = _pools[(prop, vb, off)]
    for m in sorted(grp["month_dt"].unique()):
        hist = grp[grp["month_dt"] < m]; cur_idx = grp.index[grp["month_dt"] == m]
        if len(hist) < 1000:
            pool = pool_all[pool_all["month_dt"] < m]
            if len(pool) < 1000: continue
            hist = pool
        if hist["actual"].mean() < 0.02 or hist["actual"].mean() > 0.98: continue
        A, B = fit_platt(hist["p_raw"].values, hist["actual"].values)
        if not (A > 0): continue
        pr = np.linspace(0.02, 0.98, 49); shift = np.max(np.abs(sigmoid(A * logit(pr) + B) - pr))
        if shift > 0.15: continue
        rel.loc[cur_idx, "p_over"] = sigmoid(A * logit(rel.loc[cur_idx, "p_raw"].values) + B)

# double-double (joint threshold, Gaussian copula on CALIBRATED marginals, exact trivariate term)
dd = d[d["season"] == TEST].copy()
def p_ge10(mu, var): return 1 - stats.norm.cdf(9.5, mu, np.sqrt(np.maximum(var, 1e-6)))
comps3 = ["points", "rebounds", "assists"]
P = {}
for c in comps3:
    pn = p_ge10(dd[f"mu_{c}"].values, dd[f"var_{c}"].values)
    f = OUT / f"_p10_{c}_{TEST}.pkl"
    if f.exists():
        p10 = pd.read_pickle(f); m = dd[["season", "PLAYER_ID", "GAME_ID"]].merge(p10, on=["season", "PLAYER_ID", "GAME_ID"], how="left")["p_ge10"].values
        cov_ = np.isfinite(m); pn = np.where(cov_, m, pn); print(f"DD marginal {c}: calibrated coverage {cov_.mean():.1%}")
    P[c] = pn
Z = {c: stats.norm.ppf(np.clip(1 - P[c], 1e-6, 1 - 1e-6)) for c in comps3}
def joint2(a, b):
    rho = dd[f"rho_{a}_{b}"].values if f"rho_{a}_{b}" in dd.columns else dd[f"rho_{b}_{a}"].values
    out = np.zeros(len(dd))
    for i in range(len(dd)):
        out[i] = stats.multivariate_normal.cdf([-Z[a][i], -Z[b][i]], mean=[0, 0], cov=[[1, rho[i]], [rho[i], 1]])
    return out
pab, par, prb = joint2("points", "rebounds"), joint2("points", "assists"), joint2("rebounds", "assists")
p3 = np.zeros(len(dd))
rho_pr = dd["rho_points_rebounds"].values; rho_pa = dd["rho_points_assists"].values; rho_ra = dd["rho_rebounds_assists"].values
need = (P["points"] > 0.03) & (P["rebounds"] > 0.03) & (P["assists"] > 0.03)
for i in np.where(need)[0]:
    cov = np.array([[1, rho_pr[i], rho_pa[i]], [rho_pr[i], 1, rho_ra[i]], [rho_pa[i], rho_ra[i], 1]])
    try: p3[i] = stats.multivariate_normal.cdf([-Z["points"][i], -Z["rebounds"][i], -Z["assists"][i]], mean=[0, 0, 0], cov=cov)
    except Exception: p3[i] = min(pab[i], par[i], prb[i]) * min(P["points"][i], P["rebounds"][i], P["assists"][i])
print(f"DD: exact triple term computed on {need.sum()} rows")
dd["p_dd"] = np.clip(pab + par + prb - 2 * p3, 0, 1)
dd["dd"] = (((dd["y_points"] >= 10).astype(int) + (dd["y_rebounds"] >= 10).astype(int) + (dd["y_assists"] >= 10).astype(int)) >= 2).astype(int)
dd["band"] = pd.cut(dd["p_dd"], [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001], right=False)
ddc = dd.groupby("band", observed=True).agg(n=("dd", "size"), pred=("p_dd", "mean"), actual=("dd", "mean")).reset_index(); ddc["gap_pp"] = 100 * (ddc["actual"] - ddc["pred"])
dd[["season", "PLAYER_ID", "GAME_ID", "p_dd", "dd"]].to_pickle(OUT / f"_dd_{TEST}.pkl")

more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])
legs = pd.concat([more, less], ignore_index=True); legs = legs[(legs["line"] > 0.5) | (legs["side"] == "more")]
CONF_EDGES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0001]; CONF_LABELS = ["50-55", "55-60", "60-65", "65-70", "70-75", "75-80", "80-85", "85-90", "90-95", "95+"]
legs["conf_band"] = pd.cut(legs["p_side"], bins=CONF_EDGES, labels=CONF_LABELS, right=False)
conf = legs[legs["p_side"] >= 0.5].groupby(["prop", "side", "conf_band"], observed=True).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index(); conf["gap_pp"] = 100 * (conf["hit_rate"] - conf["mean_pred"])
summary = rel.groupby(["prop", "offset"]).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), actual_over=("actual", "mean")).reset_index(); summary["gap_pp"] = 100 * (summary["actual_over"] - summary["mean_pred"])
vbd = legs.groupby(["prop", "var_band", "side", "offset"]).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index(); vbd["gap_pp"] = 100 * (vbd["hit_rate"] - vbd["mean_pred"])
worst = vbd[(vbd["gap_pp"].abs() > 2.5) & (vbd["n"] >= 500)].sort_values("gap_pp", key=lambda x: -x.abs())
md = [f"# Combos + double-double ({date.today()}) — out-of-sample {TEST}, history {TRAIN}", ""]
for prop in W:
    if BT_PROPS and prop not in BT_PROPS.split(","): continue
    s_ = summary[summary["prop"] == prop]
    md += [f"## {prop}", "| offset | n | mean pred | actual | gap pp |", "|---|---|---|---|---|"]
    for _, r in s_.iterrows(): md.append(f"| {int(r['offset']):+d} | {int(r['n'])} | {r['mean_pred']:.3f} | {r['actual_over']:.3f} | {r['gap_pp']:+.1f} |")
    for side in ("more", "less"):
        c = conf[(conf["prop"] == prop) & (conf["side"] == side)]
        md += [f"### {prop} / {side}", "| conf band | n | mean pred | hit rate | gap pp |", "|---|---|---|---|---|"]
        for _, r in c.iterrows(): md.append(f"| {r['conf_band']} | {int(r['n'])} | {100*r['mean_pred']:.1f} | {100*r['hit_rate']:.1f} | {r['gap_pp']:+.1f} |")
md += ["", "## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)", "| prop | var band | side | rung | n | pred | hit | gap pp |", "|---|---|---|---|---|---|---|---|"]
for _, r in worst.head(40).iterrows(): md.append(f"| {r['prop']} | {r['var_band']} | {r['side']} | {int(r['offset']):+d} | {int(r['n'])} | {100*r['mean_pred']:.1f} | {100*r['hit_rate']:.1f} | {r['gap_pp']:+.1f} |")
if len(worst) == 0: md.append("| (none) | | | | | | | |")
md += ["", "## Double-double: predicted P(DD) vs actual, by band", "| band | n | pred | actual | gap pp |", "|---|---|---|---|---|"]
for _, r in ddc.iterrows(): md.append(f"| {r['band']} | {int(r['n'])} | {100*r['pred']:.1f} | {100*r['actual']:.1f} | {r['gap_pp']:+.1f} |")
(OUT / f"combos_{TEST}.md").write_text("\n".join(md)); print("\n".join(md))
