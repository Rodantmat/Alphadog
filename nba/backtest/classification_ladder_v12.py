#!/usr/bin/env python3
"""
NBA Backtest Harness — Step 2: CLASSIFICATION + LADDER CALIBRATION (canonical v12).

LEG-LEVEL STATUS (v12, 2026-09-09, out-of-sample 2025-26): points and rebounds meet the ladder
standard (max rung gap 0.7pp, confidence bands within ~2pp both sides); assists close (1.1pp);
THREES_MADE NOT YET at standard ('more' 60-65 band -4.6pp; LOW band P(>=1) +3.3pp). Worst-cell
count 39 -> 28 across v10-v12. See nba/backtest/reports/classification_v12_leg_level.md for the
full status and the OPEN items (owner directive: do not move on until fixed).
  v10 hierarchical empirical fallback (tier x role x rung -> band x role x rung -> band x rung) and
      variation band added to the Platt key (with band-level pool fallback).
  v11 3PM compound model (tier on 3PA/36; makes|attempts Binomial). Did not fix the 60-65 band.
      Data checks: makes|attempts ARE binomial (var ratio 0.94; beta-binomial rejected before
      building); attempts are Poisson (iod ~1.0).
  v12 k-sweep on the VALIDATION season showed bias monotone in the band at any single shrinkage k;
      per-(prop, band) mean-ratio cells fit on 2024-25 (bandfit.py), shrunk by cell n, applied here.

Earlier history (v1-v9) is in classification_ladder_v1.py's header. This file is the full v12 body;
part 2 (from the dispersion prior onward) is appended by the same session — if the file ends before
'# STAGE 2' it is incomplete and must not be run.
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
    "threes_made": {"col": "FG3M", "att_col": "FG3A", "alpha": 0.12, "pct_alpha": 0.03, "k_stab": 25, "step": 1.0, "family": "compound"},
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
for c in ["PTS", "REB", "AST", "FG3M", "FG3A", "PF"]: players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0)
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
_m = pg[pg["season"].isin(TRAIN) & pg["proj_min_raw"].notna() & (pg["proj_min_raw"] >= 8)]
ROLE_MIN_MULT = (_m["MINF"] / _m["proj_min_raw"]).groupby(_m["role_tier"]).median().to_dict()
pg["proj_min"] = pg["proj_min_raw"] * pg["role_tier"].map(ROLE_MIN_MULT).fillna(1.0)


def ewma_prior(series, alpha):
    return series.shift(1).ewm(alpha=alpha, adjust=False, min_periods=3).mean()


from functools import lru_cache
@lru_cache(maxsize=400000)
def _compound_cdf_cached(k, att_mean_r, att_var_r, pct_r, max_att=30):
    return _compound_cdf_raw(k, att_mean_r, att_var_r, pct_r, max_att)
def compound_cdf(k, att_mean, att_var, pct, max_att=30):
    return _compound_cdf_cached(int(k), round(float(att_mean), 1), round(float(att_var), 1), round(float(pct), 2), max_att)
def _compound_cdf_raw(k, att_mean, att_var, pct, max_att=30):
    if att_mean <= 0: return 1.0
    if att_var <= att_mean * 1.02:
        p_att = stats.poisson.pmf(np.arange(max_att + 1), att_mean)
    else:
        r = att_mean * att_mean / (att_var - att_mean); q = r / (r + att_mean)
        p_att = stats.nbinom.pmf(np.arange(max_att + 1), r, q)
    p_att = p_att / max(p_att.sum(), 1e-12)
    return float(sum(p_att[a] * stats.binom.cdf(k, a, pct) for a in range(max_att + 1)))


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
    rate_col = cfg.get("att_col", col)
    df["per36"] = np.where(df["MINF"] > 0, df[rate_col] / df["MINF"] * 36, np.nan)
    gg = df.groupby(["season", "PLAYER_ID"])
    if cfg["family"] == "compound":
        df["ew_makes"] = gg[col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"], adjust=False, min_periods=3).mean())
        df["ew_att"] = gg[rate_col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"], adjust=False, min_periods=3).mean())
    df["rate36"] = gg["per36"].transform(lambda s: ewma_prior(s, cfg["alpha"]))
    df["n_rate"] = gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
    df["prior_var"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).var())
    df["prior_mean"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).mean())
    df["ym"] = pd.to_datetime(df["GAME_DATE"]).dt.to_period("M").astype(str)
    valid = df["rate36"].notna() & df["proj_min"].notna() & (df["proj_min"] >= 8)
    d = df[valid].copy()
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
    if cfg["family"] == "compound":
        _pop_pct = float(d[d["season"].isin(TRAIN)][col].sum() / max(1.0, d[d["season"].isin(TRAIN)][rate_col].sum()))
        _att_seen = d["ew_att"].fillna(0) * 20.0
        _pct_raw = (d["ew_makes"] / d["ew_att"].replace(0, np.nan)).fillna(_pop_pct)
        d["make_pct"] = ((_att_seen * _pct_raw + 60.0 * _pop_pct) / (_att_seen + 60.0)).clip(0.05, 0.6)
        d["proj_att"] = d["proj_mean"]
        d["proj_mean"] = d["proj_att"] * d["make_pct"]
    _tr = d[d["season"].isin(TRAIN)].dropna(subset=["prior_var", "prior_mean"])
    _tr_iod = (_tr["prior_var"] / _tr["prior_mean"].clip(lower=0.5))
    _bands = [0, 2, 5, 10, 15, 20, 25, 30, 200]
    iod_prior_by_band = _tr_iod.groupby(pd.cut(_tr["prior_mean"], _bands)).median()
    band_key = pd.cut(d["proj_mean"], _bands)
    iod_prior = band_key.map(iod_prior_by_band).astype(float).fillna(float(_tr_iod.median()))
    iod_player = (d["prior_var"] / d["prior_mean"].clip(lower=0.5))
# === PART 2 CONTINUES BELOW (appended in the same session) ===
