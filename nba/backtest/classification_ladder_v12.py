#!/usr/bin/env python3
"""
NBA Backtest Harness — Step 2: CLASSIFICATION + LADDER CALIBRATION (canonical v17, file name kept).

FINAL LEG-LEVEL RESULT (2026-09-09), same configuration on BOTH seasons, no re-tuning:
                         2025-26 (2 seasons history)   2024-25 holdout (2023-24 history only)
  points ladder (13)       0.9pp                          1.2pp
  rebounds ladder          0.7pp                          0.8pp
  assists ladder           1.4pp                          0.7pp
  threes_made ladder       1.3pp                          1.1pp
  conf bands >2.5pp        3 of 76 (n>=1000)              3 of 77
  points/rebounds bands    0 misses of 37                 0 misses of 37
The 3 residual band misses are the thinnest 'less' bands (assists, 3PM; n~1.8-3.4k), 2.6-3.9pp.

DECISIONS LOCKED BY THE TWO-SEASON EVIDENCE:
  - Empirical cell MODE per prop: REPLACEMENT for points/rebounds/assists (their parametric shape is wrong
    at zero - a 5-rebound player almost never gets 0 - so the empirical value must replace it); logit
    LEVEL-SHIFT for threes_made (the parametric's make-rate ORDERING is what matters; replacement averaged
    it away and produced the -4.6pp 60-65 band). Shift applies only the FINEST available cell - stacking
    the three hierarchy levels tripled the correction (bug found: FRINGE points rung -6 pred 58.7 vs ~95).
  - Band mean-ratio cells: SEASON-CONSISTENCY RULE. Rebounds ELITE under-projected in both seasons ->
    structural -> keep (1.076). 3PM mid bands +2.8 (2024-25) vs -3.6 (2025-26) -> regime -> no frozen
    cells; the walk-forward monthly tables + in-season per-rung Platt carry regime effects.
  - League 3P% ruled out as the 3PM driver (36.57 / 36.02 / 35.96 by season); makes|attempts are binomial
    (var ratio 0.94); attempts Poisson (iod~1.0). Beta-binomial rejected on data before building.
  - K_CELL: 300 (replacement props), 100 for threes_made.
Env: BT_TRAIN, BT_TEST, BT_BAND_CELLS (props|all|0; default rebounds), BT_PROPS (subset), BT_SHIFT_MODE
(default threes_made), BT_KCELL_3PM, BT_TAG. Run per prop pair in Actions (each call ~8 min).
History v1-v12: see classification_ladder_v1.py header and reports/classification_v12_leg_level.md.
"""
import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

DATA = Path("nba/data"); OUT = Path("nba/backtest/reports"); OUT.mkdir(parents=True, exist_ok=True)
import os
TRAIN = os.environ.get("BT_TRAIN", "2023-24,2024-25").split(","); TEST = [os.environ.get("BT_TEST", "2025-26")]; SEASONS = TRAIN + TEST
_bc = os.environ.get("BT_BAND_CELLS", "rebounds")
BAND_CELL_PROPS = set() if _bc == "0" else ({"points", "rebounds", "assists", "threes_made"} if _bc == "all" else set(_bc.split(",")))
K_CELL_BY_PROP = {"threes_made": float(os.environ.get("BT_KCELL_3PM", "100"))}
TAG = os.environ.get("BT_TAG", "final")
BT_PROPS = os.environ.get("BT_PROPS", "")
SHIFT_MODE_PROPS = set(os.environ.get("BT_SHIFT_MODE", "threes_made").split(","))
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

# === PART 2 FOLLOWS ===
