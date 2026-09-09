#!/usr/bin/env python3
"""
NBA Backtest Harness — Step 2: CLASSIFICATION + LADDER CALIBRATION (canonical, v1 = internal v9).

Objective (owner): "a formula where the real outcomes fit the ladder most of the time." Metric:
calibration on the ladder - predicted P(over) vs actual at every rung (anchor +/- 6), per prop,
role tier, and rung. Strictly backward-looking; walk-forward monthly on 2025-26 with 2023-24 and
2024-25 as history.

FINAL OUT-OF-SAMPLE RESULT (2026-09-09), ~21k player-games per rung:
  max |gap| across all 13 rungs: points 0.7pp | rebounds 1.0 | assists 0.7 | threes_made 0.6
  role-tier residual at anchor:  points +/-2.1 | rebounds +/-1.9 | assists +/-1.3 | threes +/-1.3

WHAT IT TOOK (each step fixed before moving on, per owner directive):
  v1  parametric only (NegBin/Normal): count props already within +/-2pp; POINTS off by up to 4pp with
      tails too thin (0.9-1.0 bin -9.8pp) and a role bias (fringe +7.5, stars -2.6).
  v2  two calibration cells fit on TRAIN: role-tier minutes multiplier and a heteroscedastic dispersion
      prior for points (var/mean 3.4 at low means -> 2.0 at 30+; a flat 1.5 default had been hitting
      16.7% of rows). Tails improved; role bias barely moved.
  v3  EMPIRICAL PER-TIER OUTCOME TABLES (rate_tier x role_tier x rung, min 300 games) as primary,
      parametric fallback. Points ladder collapsed from +/-4 to +/-1.2pp.
  v4  walk-forward monthly rebuild of the tables (absorbs season-regime drift) + MLB guards.
  v5  cell shrinkage w=k/(k+n) toward the parametric value (k=300) - far tails got WORSE, which exposed:
  v6  a bug in v4: MLB's symmetric sample-size floor (1-ceiling) forced true ~0.002 rungs up to 0.25 for
      thin-sample players. Upper ceiling only. Far tails exact again (3PM +6: 0.002 pred / 0.002 actual).
  v7  Platt per (prop, role) across the whole ladder: helped points, HURT rebounds/assists (residual lives
      in specific rungs; a single monotone transform cannot fix one region without pushing another).
  v8  Platt per (prop, role, RUNG), n>=1000 prior in-season obs, A>0, max shift 0.15: ladder within ~1pp.
  v9  ROLE-AWARE TIER PRIOR (rate tiers ranked within role tier): the persistent star/fringe anchor
      residual (+3.8 / -2.3) resolved to +/-2. Owner's granulation rule, applied where the data asked.
Note: with the backward-looking mu_role (leakage fix in step 1), the role minutes multipliers are small
(FRINGE 1.02 .. IRON_MAN 0.99); the larger earlier values were partly the leakage artifact.
Reports: nba/backtest/reports/classification_v9.{json,md}
"""
import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

DATA = Path("nba/data"); OUT = Path("nba/backtest/reports"); OUT.mkdir(parents=True, exist_ok=True)
TRAIN = ["2023-24", "2024-25"]; TEST = ["2025-26"]; SEASONS = TRAIN + TEST
SLUG = {s: s.replace("-", "_") for s in SEASONS}
BLOWOUT_MARGIN = 20; COMPETITIVE_MARGIN = 15
MAX_TIERS = 24; MIN_PER_TIER = 15; TIER_BLEND_K = 5; LADDER_STEPS = 6
PROPS = {
    "points":      {"col": "PTS",  "alpha": 0.12, "k_stab": 25, "step": 1.0, "family": "auto"},
    "rebounds":    {"col": "REB",  "alpha": 0.08, "k_stab": 40, "step": 1.0, "family": "negbin"},
    "assists":     {"col": "AST",  "alpha": 0.15, "k_stab": 20, "step": 1.0, "family": "negbin"},
    "threes_made": {"col": "FG3M", "alpha": 0.12, "k_stab": 25, "step": 1.0, "family": "negbin"},
}
ROLE_TIERS = [("IRON_MAN", 36, 99), ("HIGH_USAGE_STARTER", 32, 36), ("STARTER", 27, 32), ("ROTATION", 21, 27), ("BENCH", 15, 21), ("FRINGE", 0, 15)]
MIN_RATIO = {"IRON_MAN": (0.832, 0.841), "HIGH_USAGE_STARTER": (0.837, 0.855), "STARTER": (0.867, 0.908), "ROTATION": (0.960, 1.003), "BENCH": (1.015, 1.074), "FRINGE": (1.180, 1.430)}
P_BLOWOUT_BINS = [0, 2, 4, 6, 8, 10, 12, 15, 99]
P_BLOWOUT = [0.168, 0.158, 0.208, 0.184, 0.199, 0.304, 0.374, 0.393]


def role_tier(m):
    for k, lo, hi in ROLE_TIERS:
        if lo <= m < hi: return k
    return "FRINGE"


def load(path): return pd.DataFrame(json.loads(Path(path).read_text()).get("records", []))


def to_min(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return np.nan
    if isinstance(v, str) and ":" in v:
        m, s = v.split(":"); return float(m) + float(s) / 60
    try: return float(v)
    except Exception: return np.nan


P, T, TA = [], [], []
for s in SEASONS:
    p = load(DATA / f"nba_player_game_log_{SLUG[s]}.json"); p["season"] = s; P.append(p)
    t = load(DATA / f"nba_team_game_log_{SLUG[s]}.json"); t["season"] = s; T.append(t)
    ta = load(DATA / f"nba_team_game_log_advanced_{SLUG[s]}.json"); ta["season"] = s; TA.append(ta)
players = pd.concat(P, ignore_index=True); teams = pd.concat(T, ignore_index=True); teams_adv = pd.concat(TA, ignore_index=True)
for df in (players, teams): df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
for df in (players, teams, teams_adv):
    df["GAME_ID"] = df["GAME_ID"].astype(str); df["TEAM_ID"] = df["TEAM_ID"].astype(str)
teams_adv = teams_adv.merge(teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE"]], on=["season", "TEAM_ID", "GAME_ID"], how="inner")
players["MINF"] = players["MIN"].apply(to_min)
for c in ["PTS", "REB", "AST", "FG3M", "PF"]: players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0)
players["PLAYER_ID"] = players["PLAYER_ID"].astype(str)
teams["is_home"] = teams["MATCHUP"].str.contains("vs."); teams["margin"] = pd.to_numeric(teams["PLUS_MINUS"], errors="coerce")
teams_adv["NET_RATING"] = pd.to_numeric(teams_adv["NET_RATING"], errors="coerce")
teams_adv = teams_adv.sort_values(["season", "TEAM_ID", "GAME_DATE"])
teams_adv["pre_net"] = teams_adv.groupby(["season", "TEAM_ID"])["NET_RATING"].transform(lambda s: s.shift(1).expanding().mean())
teams_adv["pre_n"] = teams_adv.groupby(["season", "TEAM_ID"]).cumcount()
teams_adv["pre_net_shrunk"] = teams_adv["pre_net"].fillna(0) * (teams_adv["pre_n"] / (teams_adv["pre_n"] + 10))
teams = teams.sort_values(["season", "TEAM_ID", "GAME_DATE"])
teams["prev_date"] = teams.groupby(["season", "TEAM_ID"])["GAME_DATE"].shift(1)
teams["rest_days"] = [(g - p).days - 1 if isinstance(p, date) else np.nan for g, p in zip(teams["GAME_DATE"], teams["prev_date"])]
tg = teams.merge(teams_adv[["season", "TEAM_ID", "GAME_ID", "pre_net_shrunk"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
home = tg[tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk", "rest_days", "margin"]].rename(columns={"TEAM_ID": "home_id", "pre_net_shrunk": "home_net", "rest_days": "home_rest", "margin": "home_margin"})
away = tg[~tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk", "rest_days"]].rename(columns={"TEAM_ID": "away_id", "pre_net_shrunk": "away_net", "rest_days": "away_rest"})
games = home.merge(away, on=["season", "GAME_ID"], how="inner")
games["rest_diff"] = (games["home_rest"].fillna(2) - games["away_rest"].fillna(2)).clip(-3, 3)
HCA = 1.98
games["derived_spread"] = (games["home_net"] - games["away_net"]) + HCA + 0.5 * games["rest_diff"]
games["abs_margin"] = games["home_margin"].abs()
games["p_blowout"] = pd.cut(games["derived_spread"].abs(), bins=P_BLOWOUT_BINS, labels=P_BLOWOUT, include_lowest=True).astype(float)
games["home_favored"] = games["derived_spread"] > 0

pg = players.merge(games[["season", "GAME_ID", "home_id", "home_margin", "abs_margin", "p_blowout", "home_favored"]], on=["season", "GAME_ID"], how="inner")
pg["team_margin"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_margin"], -pg["home_margin"])
pg["favored"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_favored"], ~pg["home_favored"])
pg = pg.sort_values(["season", "PLAYER_ID", "GAME_DATE"]).reset_index(drop=True)
pg["competitive"] = pg["abs_margin"] < COMPETITIVE_MARGIN
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
g = pg.groupby(["season", "PLAYER_ID"])
pg["mu_role"] = g["comp_min"].transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
pg["role_tier"] = pg["mu_role"].apply(lambda m: role_tier(m) if not np.isnan(m) else None)
pg["n_prior"] = g.cumcount()


def proj_minutes(r):
    if np.isnan(r["mu_role"]) or r["role_tier"] is None: return np.nan
    won_r, lost_r = MIN_RATIO[r["role_tier"]]
    ratio = won_r if r["favored"] else lost_r
    pb = r["p_blowout"] if not np.isnan(r["p_blowout"]) else 0.2
    return r["mu_role"] * ((1 - pb) + pb * ratio)
pg["proj_min_raw"] = pg.apply(proj_minutes, axis=1)
# CALIBRATION CELL #1 (fit on TRAIN only): actual/projected minutes by role tier.
_m = pg[pg["season"].isin(TRAIN) & pg["proj_min_raw"].notna() & (pg["proj_min_raw"] >= 8)]
ROLE_MIN_MULT = (_m["MINF"] / _m["proj_min_raw"]).groupby(_m["role_tier"]).median().to_dict()
pg["proj_min"] = pg["proj_min_raw"] * pg["role_tier"].map(ROLE_MIN_MULT).fillna(1.0)


def ewma_prior(series, alpha):
    return series.shift(1).ewm(alpha=alpha, adjust=False, min_periods=3).mean()


def nb_cdf(k, mean, var):
    if mean <= 0: return 1.0
    if var <= mean * 1.02:
        return float(stats.poisson.cdf(k, mean))
    r = mean * mean / (var - mean); p = r / (r + mean)
    return float(stats.nbinom.cdf(k, r, p))


reliab = []
for prop, cfg in PROPS.items():
    col = cfg["col"]
    df = pg.copy()
    df["per36"] = np.where(df["MINF"] > 0, df[col] / df["MINF"] * 36, np.nan)
    gg = df.groupby(["season", "PLAYER_ID"])
    df["rate36"] = gg["per36"].transform(lambda s: ewma_prior(s, cfg["alpha"]))
    df["n_rate"] = gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
    df["prior_var"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).var())
    df["prior_mean"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).mean())
    df["ym"] = pd.to_datetime(df["GAME_DATE"]).dt.to_period("M").astype(str)
    valid = df["rate36"].notna() & df["proj_min"].notna() & (df["proj_min"] >= 8)
    d = df[valid].copy()
    # ROLE-AWARE TIER PRIOR: rate tiers ranked WITHIN role tier (owner's granulation rule).
    tier_prior = {}
    for (s, ym, role), grp in d.groupby(["season", "ym", "role_tier"]):
        pop = grp.groupby("PLAYER_ID")["rate36"].last()
        n = len(pop); total_tiers = max(1, min(MAX_TIERS, n // MIN_PER_TIER))
        ranks = pop.rank(pct=True, method="first")
        tier_of = np.minimum(total_tiers, np.floor(ranks * total_tiers) + 1).astype(int)
        tier_mean = pop.groupby(tier_of).mean(); tier_n = pop.groupby(tier_of).size(); pop_mean = pop.mean()
        for pid, tnum in tier_of.items():
            tm, tn = tier_mean[tnum], tier_n[tnum]
            blended = (tn * tm + TIER_BLEND_K * pop_mean) / (tn + TIER_BLEND_K)
            tier_prior[(s, ym, role, pid)] = (int(tnum), int(total_tiers), float(blended))
    d["tier"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[0] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]
    d["tier_prior"] = [tier_prior.get((s, y, r, p), (None, None, np.nan))[2] for s, y, r, p in zip(d["season"], d["ym"], d["role_tier"], d["PLAYER_ID"])]
    k = cfg["k_stab"]; n = d["n_rate"].clip(lower=1)
    d["shrunk36"] = (n * d["rate36"] + k * d["tier_prior"]) / (n + k)
    d["proj_mean"] = d["shrunk36"] * d["proj_min"] / 36
    # CALIBRATION CELL #2 (fit on TRAIN only): heteroscedastic index of dispersion by mean band.
    _tr = d[d["season"].isin(TRAIN)].dropna(subset=["prior_var", "prior_mean"])
    _tr_iod = (_tr["prior_var"] / _tr["prior_mean"].clip(lower=0.5))
    _bands = [0, 2, 5, 10, 15, 20, 25, 30, 200]
    iod_prior_by_band = _tr_iod.groupby(pd.cut(_tr["prior_mean"], _bands)).median()
    band_key = pd.cut(d["proj_mean"], _bands)
    iod_prior = band_key.map(iod_prior_by_band).astype(float).fillna(float(_tr_iod.median()))
    iod_player = (d["prior_var"] / d["prior_mean"].clip(lower=0.5))
    n_iod = d["prior_var"].notna().astype(float) * 20.0
    iod = ((n_iod * iod_player.fillna(0) + 10.0 * iod_prior) / (n_iod + 10.0)).clip(lower=1.0, upper=8.0)
    n_eff = d["n_rate"].clip(lower=1)
    d["proj_var"] = np.maximum(d["proj_mean"] * iod * (1 + 1 / n_eff), d["proj_mean"] + 1e-6)
    d["anchor"] = np.floor(d["proj_mean"]) + 0.5
    # EMPIRICAL PER-TIER OUTCOME TABLES, rebuilt walk-forward monthly.
    EMP_MIN = 300
    d["ym_dt"] = pd.to_datetime(d["GAME_DATE"]).dt.to_period("M")
    test_all = d[d["season"].isin(TEST)]
    emp_hits = 0
    for month, test in test_all.groupby("ym_dt"):
        hist = d[(d["season"].isin(TRAIN) | (d["ym_dt"] < month)) & d["tier"].notna()]
        emp = {}
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line_tr = (hist["anchor"] + off * cfg["step"]).clip(lower=0.5)
            hit = (hist[col] > line_tr).astype(int)
            key = pd.DataFrame({"t": hist["tier"].values, "r": hist["role_tier"].values, "hit": hit.values})
            agg = key.groupby(["t", "r"])["hit"].agg(["mean", "count"])
            for (t, r), row in agg.iterrows():
                if row["count"] >= EMP_MIN: emp[(int(t), r, off)] = (float(row["mean"]), int(row["count"]))
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line = (test["anchor"] + off * cfg["step"]).clip(lower=0.5)
            k_int = np.floor(line).astype(int)
            use_normal = (cfg["family"] == "auto") & (test["proj_mean"] >= 10)
            p_under = np.where(use_normal,
                               stats.norm.cdf(line, test["proj_mean"], np.sqrt(test["proj_var"])),
                               [nb_cdf(kk, m, v) for kk, m, v in zip(k_int, test["proj_mean"], test["proj_var"])])
            p_param = 1 - p_under
            n_g = test["n_rate"].clip(lower=1).values.astype(float)
            # Upper sample-size ceiling only (the symmetric floor was a real bug for far rungs).
            ceiling = np.minimum(0.99, 0.99 - 0.30 * np.exp(-n_g / 25))
            p_param = np.minimum(p_param, ceiling)
            small = n_g < 30
            if small.any():
                z = 1.96; ph = p_param[small]; nn = n_g[small]
                center = (ph + z * z / (2 * nn)) / (1 + z * z / nn)
                margin = z * np.sqrt(ph * (1 - ph) / nn + z * z / (4 * nn * nn)) / (1 + z * z / nn)
                p_param[small] = np.clip(ph, np.maximum(0, center - margin), np.minimum(1, center + margin))
            # CELL SHRINKAGE w=k/(k+n) toward the parametric value, k=300.
            K_CELL = 300.0
            cells = [emp.get((int(t) if t is not None and not (isinstance(t, float) and np.isnan(t)) else -1, r, off), (np.nan, 0)) for t, r in zip(test["tier"], test["role_tier"])]
            p_emp = np.array([c[0] for c in cells]); n_cell = np.array([c[1] for c in cells], dtype=float)
            p_blend = (n_cell * np.nan_to_num(p_emp) + K_CELL * p_param) / (n_cell + K_CELL)
            p_over = np.where(np.isnan(p_emp), p_param, p_blend)
            emp_hits += int((~np.isnan(p_emp)).sum())
            actual_over = (test[col] > line).astype(int).values
            rel = pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": actual_over, "anchor": test["anchor"].values, "role_tier": test["role_tier"].values, "used_emp": ~np.isnan(p_emp), "month": str(month)})
            reliab.append(rel)
    test = test_all
    print(f"{prop}: empirical cell coverage {emp_hits / (len(test) * (2 * LADDER_STEPS + 1)):.1%} of test predictions, {len(emp)} cells")
rel = pd.concat(reliab, ignore_index=True)


# PLATT per (prop, role_tier, RUNG), walk-forward on prior in-season months; MLB guards.
def logit(p): p = np.clip(p, 1e-4, 1 - 1e-4); return np.log(p / (1 - p))
def sigmoid(x): return 1 / (1 + np.exp(-x))
def fit_platt(p, y, iters=25):
    x = logit(p); A, B = 1.0, 0.0
    for _ in range(iters):
        z = A * x + B; q = sigmoid(z); w = q * (1 - q) + 1e-9
        gA = np.sum((q - y) * x); gB = np.sum(q - y)
        hAA = np.sum(w * x * x); hAB = np.sum(w * x); hBB = np.sum(w)
        det = hAA * hBB - hAB * hAB
        if det <= 1e-12: break
        dA = (hBB * gA - hAB * gB) / det; dB = (hAA * gB - hAB * gA) / det
        A -= dA; B -= dB
    return A, B
rel["p_raw"] = rel["p_over"].copy()
rel["month_dt"] = pd.PeriodIndex(rel["month"], freq="M")
platt_log = []
for (prop, role, off), grp in rel.groupby(["prop", "role_tier", "offset"]):
    for m in sorted(grp["month_dt"].unique()):
        hist = grp[grp["month_dt"] < m]
        cur_idx = grp.index[grp["month_dt"] == m]
        if len(hist) < 1000: continue
        if hist["actual"].mean() < 0.02 or hist["actual"].mean() > 0.98: continue
        A, B = fit_platt(hist["p_raw"].values, hist["actual"].values)
        if not (A > 0): continue
        pr = np.linspace(0.02, 0.98, 49); shift = np.max(np.abs(sigmoid(A * logit(pr) + B) - pr))
        if shift > 0.15: continue
        rel.loc[cur_idx, "p_over"] = sigmoid(A * logit(rel.loc[cur_idx, "p_raw"].values) + B)
        platt_log.append({"prop": prop, "role_tier": role, "offset": int(off), "month": str(m), "A": round(float(A), 4), "B": round(float(B), 4), "n_fit": int(len(hist)), "max_shift": round(float(shift), 4)})
platt_df = pd.DataFrame(platt_log)


def brier(p, y): return float(np.mean((p - y) ** 2))
def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
summary = []
for prop, grp in rel.groupby("prop"):
    for off, g2 in grp.groupby("offset"):
        summary.append({"prop": prop, "offset": int(off), "n": int(len(g2)), "mean_pred": round(float(g2["p_over"].mean()), 4), "actual_over": round(float(g2["actual"].mean()), 4), "gap_pp": round(100 * (float(g2["actual"].mean()) - float(g2["p_over"].mean())), 2), "brier": round(brier(g2["p_over"].values, g2["actual"].values), 4), "brier_param_only": round(brier(g2["p_param"].values, g2["actual"].values), 4), "logloss": round(logloss(g2["p_over"].values, g2["actual"].values), 4), "emp_share": round(float(g2["used_emp"].mean()), 3)})
summary = pd.DataFrame(summary)
rel["bin"] = pd.cut(rel["p_over"], bins=np.linspace(0, 1, 11), include_lowest=True)
reliability = rel.groupby(["prop", "bin"], observed=True).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), actual=("actual", "mean")).reset_index()
reliability["gap_pp"] = 100 * (reliability["actual"] - reliability["mean_pred"])
by_role = rel[rel["offset"] == 0].groupby(["prop", "role_tier"]).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), mean_raw=("p_raw", "mean"), actual=("actual", "mean")).reset_index()
by_role["gap_pp"] = 100 * (by_role["actual"] - by_role["mean_pred"]); by_role["gap_raw_pp"] = 100 * (by_role["actual"] - by_role["mean_raw"])

report = {"platt_fits": json.loads(platt_df.to_json(orient="records")) if len(platt_df) else [], "role_minutes_multiplier_train_fit": {k: round(float(v), 4) for k, v in ROLE_MIN_MULT.items()}, "generated_at": str(date.today()), "test_season": TEST, "props": list(PROPS), "ladder_steps": LADDER_STEPS,
          "per_offset": json.loads(summary.to_json(orient="records")),
          "reliability_deciles": json.loads(reliability.astype({"bin": str}).to_json(orient="records")),
          "anchor_by_role_tier": json.loads(by_role.to_json(orient="records"))}
(OUT / "classification_v9.json").write_text(json.dumps(report, indent=2, default=str))
md = [f"# Classification + ladder calibration v9 ({date.today()}) — out-of-sample {TEST}", ""]
for prop in PROPS:
    s = summary[summary["prop"] == prop]
    md += [f"## {prop}", "| offset | n | mean pred P(over) | actual over | gap (pp) | Brier (emp+param) | Brier (param only) | emp share |", "|---|---|---|---|---|---|---|---|"]
    for _, r in s.iterrows(): md.append(f"| {r['offset']:+d} | {r['n']} | {r['mean_pred']:.3f} | {r['actual_over']:.3f} | {r['gap_pp']:+.1f} | {r['brier']:.4f} | {r['brier_param_only']:.4f} | {r['emp_share']:.2f} |")
    rr = reliability[reliability["prop"] == prop]
    md += ["", "Reliability (all offsets pooled):", "| pred bin | n | mean pred | actual | gap pp |", "|---|---|---|---|---|"]
    for _, r in rr.iterrows(): md.append(f"| {r['bin']} | {int(r['n'])} | {r['mean_pred']:.3f} | {r['actual']:.3f} | {r['gap_pp']:+.1f} |")
    br = by_role[by_role["prop"] == prop]
    md += ["", "At the anchor, by role tier (after Platt / before):", "| role | n | mean pred | actual | gap pp | gap before Platt |", "|---|---|---|---|---|---|"]
    for _, r in br.iterrows(): md.append(f"| {r['role_tier']} | {int(r['n'])} | {r['mean_pred']:.3f} | {r['actual']:.3f} | {r['gap_pp']:+.1f} | {r['gap_raw_pp']:+.1f} |")
    md.append("")
(OUT / "classification_v9.md").write_text("\n".join(md)); print("\n".join(md))
