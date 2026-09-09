#!/usr/bin/env python3
"""
NBA Backtest Harness — Step 2: CLASSIFICATION + LADDER CALIBRATION (canonical v18; file name kept).

EXTENSION (v18, 2026-09-09): blocks/steals/turnovers/fga/fg3a/ftm/personal_fouls added under the same standard.
  blocks+steals at lambda=0.5 shift mode with DATA-FIT prior strength (STL k=125, TOV k=60: k_MoM relative
  to points STL 4.9x, TOV 2.5x, BLK 1.7x; top-decile steals players regress 17% over the next 20 games):
  2025-26 ladder blocks 0.8 / steals 1.4; 0 band x direction x rung cells over 2.5pp; conf bands 3 of 26
  miss (blocks more 70-75 -4.3 n=3900 = P(0 blocks) under-predicted for ~1.5bpg players, persists at any
  lambda; blocks less 75-80 -2.6 thin; steals less 60-65 +3.6). Holdout 2024-25 shows the same signs.
  turnovers/fga/fg3a/ftm/personal_fouls: configured, NOT yet run.
REJECTED ON DATA: player-own L0 cells (n=40-80; regression-noise dominated; ELITE rebounds +/-7.7). Off.
SHIFT_LAMBDA = ordering strength per prop in shift mode (1.0 full parametric ordering, 0 replacement).

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
SHIFT_MODE_PROPS = set(os.environ.get("BT_SHIFT_MODE", "threes_made,blocks,steals,ftm").split(","))
PLAYER_L0 = os.environ.get("BT_PLAYER_L0", "0") == "1"   # REJECTED on data 2026-09-09 (regression-noise dominated); off by default
L0_MIN, L0_K = 40, 40.0
# Ordering strength lambda in shift mode. Evidence per prop: threes 1.0; blocks/steals/ftm 0.5; turnovers/fouls
# tested at 0.5 and 0.25 and were WORSE than replacement -> stay replacement.
SHIFT_LAMBDA = {p: float(v) for p, v in (kv.split(":") for kv in os.environ.get("BT_SHIFT_LAMBDA", "threes_made:1.0,blocks:0.5,steals:0.5,ftm:0.5").split(","))}
SLUG = {s: s.replace("-", "_") for s in SEASONS}
BLOWOUT_MARGIN = 20; COMPETITIVE_MARGIN = 15
MAX_TIERS = 24; MIN_PER_TIER = 15; TIER_BLEND_K = 5; LADDER_STEPS = 6
PROPS = {
    "points":      {"col": "PTS",  "alpha": 0.12, "k_stab": 25, "step": 1.0, "family": "auto"},
    "rebounds":    {"col": "REB",  "alpha": 0.08, "k_stab": 40, "step": 1.0, "family": "negbin"},
    "assists":     {"col": "AST",  "alpha": 0.15, "k_stab": 20, "step": 1.0, "family": "negbin"},
    "threes_made": {"col": "FG3M", "att_col": "FG3A", "alpha": 0.12, "pct_alpha": 0.03, "k_stab": 25, "step": 1.0, "family": "compound"},
    # Extension props. Prior strength from data (2026-09-09): k_MoM relative to points = STL 4.9x, TOV 2.5x, BLK 1.7x.
    "blocks":      {"col": "BLK",  "alpha": 0.10, "k_stab": 50, "step": 1.0, "family": "negbin", "zero_adjust": True},
    "steals":      {"col": "STL",  "alpha": 0.10, "k_stab": 125, "step": 1.0, "family": "negbin", "zero_adjust": True},
    "turnovers":   {"col": "TOV",  "alpha": 0.12, "k_stab": 95, "step": 1.0, "family": "negbin", "zero_adjust": True},   # top-decile regression 13%
    "fga":         {"col": "FGA",  "alpha": 0.15, "k_stab": 15, "step": 1.0, "family": "auto"},   # CERTIFIED both seasons (0.9 / 1.3, 0 band misses)
    "fg3a":        {"col": "FG3A", "alpha": 0.12, "k_stab": 20, "step": 1.0, "family": "negbin"},   # anchor-band residual is attempts REGIME (sign flips across seasons)
    "ftm":         {"col": "FTM",  "att_col": "FTA", "alpha": 0.12, "pct_alpha": 0.03, "k_stab": 60, "step": 1.0, "family": "compound"},   # FTA regression 9%; shift lambda 0.5
    "personal_fouls": {"col": "PF", "alpha": 0.10, "k_stab": 100, "step": 1.0, "family": "negbin", "zero_adjust": True},   # top-decile regression 14%
}
VBANDS_ALL = {"points": [(0, 9.5, "FRINGE"), (9.5, 17.5, "ROLE"), (17.5, 25.5, "STARTER"), (25.5, 31.5, "STAR"), (31.5, 99, "SUPERSTAR")],
              "rebounds": [(0, 3.5, "LOW"), (3.5, 6.5, "MID"), (6.5, 9.5, "HIGH"), (9.5, 99, "ELITE")],
              "assists": [(0, 2.5, "LOW"), (2.5, 5.5, "MID"), (5.5, 8.5, "HIGH"), (8.5, 99, "ELITE")],
              "threes_made": [(0, 1.5, "LOW"), (1.5, 2.5, "MID"), (2.5, 4.5, "HIGH"), (4.5, 99, "ELITE")],
              "blocks": [(0, 0.6, "LOW"), (0.6, 1.6, "MID"), (1.6, 99, "HIGH")],
              "steals": [(0, 0.6, "LOW"), (0.6, 1.6, "MID"), (1.6, 99, "HIGH")],
              "turnovers": [(0, 1.5, "LOW"), (1.5, 2.5, "MID"), (2.5, 3.5, "HIGH"), (3.5, 99, "ELITE")],
              "fga": [(0, 7.5, "LOW"), (7.5, 12.5, "MID"), (12.5, 17.5, "HIGH"), (17.5, 99, "ELITE")],
              "fg3a": [(0, 3.5, "LOW"), (3.5, 6.5, "MID"), (6.5, 9.5, "HIGH"), (9.5, 99, "ELITE")],
              "ftm": [(0, 1.5, "LOW"), (1.5, 3.5, "MID"), (3.5, 5.5, "HIGH"), (5.5, 99, "ELITE")],
              "personal_fouls": [(0, 1.5, "LOW"), (1.5, 2.5, "MID"), (2.5, 99, "HIGH")]}
ROLE_TIERS = [("IRON_MAN", 36, 99), ("HIGH_USAGE_STARTER", 32, 36), ("STARTER", 27, 32), ("ROTATION", 21, 27), ("BENCH", 15, 21), ("FRINGE", 0, 15)]
P_BLOWOUT_BINS = [0, 2, 4, 6, 8, 10, 12, 15, 99]
# MIN_RATIO and P_BLOWOUT are derived from TRAIN inside the run (see below) - no pasted constants.


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
for c in ["PTS", "REB", "AST", "FG3M", "FG3A", "PF", "BLK", "STL", "TOV", "FGA", "FTM", "FTA"]: players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0)
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
# ONE RECIPE, NO PASTED CONSTANTS: HCA, the P(blowout | spread) lookup and the blowout minutes ratios are
# derived from the TRAIN (as-of history) seasons inside the run. Holdout 2024-25 unchanged (1.2 / 0.8 / 0 of 37).
_trg = games[games["season"].isin(TRAIN)]
HCA = float((_trg["home_margin"] - (_trg["home_net"] - _trg["away_net"])).mean())
games["derived_spread"] = (games["home_net"] - games["away_net"]) + HCA + 0.5 * games["rest_diff"]
games["abs_margin"] = games["home_margin"].abs()
_trg = games[games["season"].isin(TRAIN)]
_bl = (_trg["abs_margin"] >= BLOWOUT_MARGIN).groupby(pd.cut(_trg["derived_spread"].abs(), bins=P_BLOWOUT_BINS, include_lowest=True), observed=False).mean()
P_BLOWOUT = [float(v) if not np.isnan(v) else 0.2 for v in _bl.values]
games["p_blowout"] = pd.cut(games["derived_spread"].abs(), bins=P_BLOWOUT_BINS, labels=P_BLOWOUT, include_lowest=True, ordered=False).astype(float)
games["home_favored"] = games["derived_spread"] > 0

pg = players.merge(games[["season", "GAME_ID", "home_id", "home_margin", "abs_margin", "p_blowout", "home_favored"]], on=["season", "GAME_ID"], how="inner")
pg["team_margin"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_margin"], -pg["home_margin"])
pg["favored"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_favored"], ~pg["home_favored"])
pg = pg.sort_values(["PLAYER_ID", "GAME_DATE"]).reset_index(drop=True)
pg["competitive"] = pg["abs_margin"] < COMPETITIVE_MARGIN
pg["comp_min"] = np.where(pg["competitive"] & (pg["PF"] < 6), pg["MINF"], np.nan)
# CROSS-SEASON CARRYOVER (season-opening study 2026-09-09): without it the opening month has ZERO projections and
# November only 62% coverage (within-season rates need 3 games, the minutes role 5). Minutes role and rate EWMA are
# carried across seasons at the player level; at a season boundary the carried evidence counts as CARRY_N games so
# the prior season anchors the opening weeks while new-season games adapt fast. Coverage: Oct 85%, Nov 90%.
CARRY = os.environ.get("BT_CARRY", "1") == "1"
if CARRY:
    gp = pg.groupby("PLAYER_ID")
    pg["mu_role"] = gp["comp_min"].transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
    g = pg.groupby(["season", "PLAYER_ID"])
else:
    g = pg.groupby(["season", "PLAYER_ID"])
    pg["mu_role"] = g["comp_min"].transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
pg["role_tier"] = pg["mu_role"].apply(lambda m: role_tier(m) if not np.isnan(m) else None)
pg["n_prior"] = g.cumcount()
# RETURN RAMP + TEAM-CHANGE (season-opening / availability study 2026-09-09, measured on 3 seasons):
# games missed = the team's games between the player's previous appearance and this game; game-back index 1..4 after an
# absence of >=3 games. Measured minutes ratio vs the 10-game role: missed 3-7 -> 0.87/0.97/1.01; 8-15 -> 0.79/0.92/0.96;
# 16+ -> 0.72/0.84/0.92/1.00 (game 1/2/3/4). Per-minute rate unchanged (~1.0) -> a MINUTES multiplier only, fit on TRAIN.
_tgd = teams.groupby(["season", "TEAM_ID"])["GAME_DATE"].apply(lambda x: np.array(sorted(x))).to_dict()
_prev_gd = pg.groupby(["PLAYER_ID"])["GAME_DATE"].shift(1); _prev_tid = pg.groupby(["PLAYER_ID"])["TEAM_ID"].shift(1); _prev_season = pg.groupby(["PLAYER_ID"])["season"].shift(1)
def _missed(s_, tid_, prev_, gd_, ps_):
    if not isinstance(prev_, date) or ps_ != s_: return 0
    arr = _tgd.get((s_, tid_)); return int(((arr > prev_) & (arr < gd_)).sum()) if arr is not None else 0
pg["games_missed"] = [_missed(a, b, c, d_, e) for a, b, c, d_, e in zip(pg["season"], pg["TEAM_ID"], _prev_gd, pg["GAME_DATE"], _prev_season)]
pg["team_changed"] = ((_prev_tid.notna()) & (_prev_tid != pg["TEAM_ID"])).astype(int)
_gb, _st = [], {}
for pid_, s_, m_ in zip(pg["PLAYER_ID"], pg["season"], pg["games_missed"]):
    k_ = (s_, pid_)
    if m_ >= 3: _st[k_] = (1, m_)
    elif _st.get(k_) and m_ == 0 and _st[k_][0] < 4: _st[k_] = (_st[k_][0] + 1, _st[k_][1])
    else: _st[k_] = None
    _gb.append(_st[k_] if _st[k_] else (0, 0))
pg["gb_idx"] = [x[0] for x in _gb]; pg["gb_missed"] = [x[1] for x in _gb]
RAMP_ON = os.environ.get("BT_RAMP", "1") == "1"
_tm = pg[pg["season"].isin(TRAIN) & pg["mu_role"].notna() & (pg["mu_role"] > 0)].copy()
_tm["won_bl"] = _tm["team_margin"] >= BLOWOUT_MARGIN; _tm["lost_bl"] = _tm["team_margin"] <= -BLOWOUT_MARGIN
_tm["ratio"] = _tm["MINF"] / _tm["mu_role"]
MIN_RATIO = {}
for rt, _lo, _hi in ROLE_TIERS:
    w = _tm[(_tm["role_tier"] == rt) & _tm["won_bl"]]["ratio"].mean(); l = _tm[(_tm["role_tier"] == rt) & _tm["lost_bl"]]["ratio"].mean()
    MIN_RATIO[rt] = (float(w) if not np.isnan(w) else 0.9, float(l) if not np.isnan(l) else 0.95)

# ---------------------------------------------------------------- FACTOR LAYER (baseline, static/derived)
# Owner: the factor layer must be in from the start; nothing forced - each coefficient is FIT on TRAIN in
# log-rate space and may land at ~0 if the factor is unneeded. Per-team as-of rolling (shift(1), last 15
# games) stats from the committed team files, attached to each player-game as the OPPONENT's profile.
# First fits (2025-26 / 2024-25 holdout): blocks opp paint share 0.30/0.37, steals opp TOV rate 0.27/0.26
# (stable, transferable); pace 0.30/0.16 and 0.23/-0.03 (unstable with one training season); home and B2B ~0.
FF, SC = [], []
for s_ in SEASONS:
    f = pd.DataFrame(json.loads((DATA / f"nba_backfill_team_four_factors_{SLUG[s_]}.json").read_text()).get("records", [])); f["season"] = s_; FF.append(f)
    c = pd.DataFrame(json.loads((DATA / f"nba_backfill_team_scoring_{SLUG[s_]}.json").read_text()).get("records", [])); c["season"] = s_; SC.append(c)
ff = pd.concat(FF, ignore_index=True); sc = pd.concat(SC, ignore_index=True)
for df_ in (ff, sc):
    df_["GAME_ID"] = df_["GAME_ID"].astype(str); df_["TEAM_ID"] = df_["TEAM_ID"].astype(str)
tf = teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE", "FGA", "FG3A", "PF"]].copy()
for c_ in ["FGA", "FG3A", "PF"]: tf[c_] = pd.to_numeric(tf[c_], errors="coerce")
tf = tf.merge(teams_adv[["season", "TEAM_ID", "GAME_ID", "PACE", "DEF_RATING", "OFF_RATING"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
tf = tf.merge(ff[["season", "TEAM_ID", "GAME_ID", "EFG_PCT", "FTA_RATE", "TM_TOV_PCT", "OREB_PCT", "OPP_EFG_PCT", "OPP_FTA_RATE", "OPP_TOV_PCT", "OPP_OREB_PCT"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
tf = tf.merge(sc[["season", "TEAM_ID", "GAME_ID", "PCT_PTS_PAINT", "PCT_FGA_3PT"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
opp_line = tf[["season", "GAME_ID", "TEAM_ID", "FGA", "FG3A", "PCT_PTS_PAINT", "PCT_FGA_3PT"]].rename(columns={"TEAM_ID": "OTHER_ID", "FGA": "o_FGA", "FG3A": "o_FG3A", "PCT_PTS_PAINT": "o_paint", "PCT_FGA_3PT": "o_3pa_share"})
tf = tf.merge(opp_line, on=["season", "GAME_ID"], how="left"); tf = tf[tf["TEAM_ID"] != tf["OTHER_ID"]]
tf["allowed_3pa_share"] = tf["o_3pa_share"]; tf["allowed_paint_share"] = tf["o_paint"]
FCOLS = ["PACE", "DEF_RATING", "OFF_RATING", "EFG_PCT", "FTA_RATE", "TM_TOV_PCT", "OREB_PCT", "OPP_EFG_PCT", "OPP_FTA_RATE", "OPP_TOV_PCT", "OPP_OREB_PCT", "PCT_PTS_PAINT", "PCT_FGA_3PT", "allowed_3pa_share", "allowed_paint_share"]
for c_ in FCOLS: tf[c_] = pd.to_numeric(tf[c_], errors="coerce")
tf = tf.sort_values(["season", "TEAM_ID", "GAME_DATE"])
gt = tf.groupby(["season", "TEAM_ID"])
for c_ in FCOLS: tf["asof_" + c_] = gt[c_].transform(lambda x: x.shift(1).rolling(15, min_periods=5).mean())
asof = tf[["season", "TEAM_ID", "GAME_ID"] + ["asof_" + c_ for c_ in FCOLS]]
pg["OPP_ID"] = np.where(pg["TEAM_ID"] == pg["home_id"], games.set_index(["season", "GAME_ID"]).loc[list(zip(pg["season"], pg["GAME_ID"])), "away_id"].values, pg["home_id"])
pg = pg.merge(asof[["season", "TEAM_ID", "GAME_ID", "asof_PACE"]].rename(columns={"asof_PACE": "own_pace"}), on=["season", "TEAM_ID", "GAME_ID"], how="left")
pg = pg.merge(asof.rename(columns={"TEAM_ID": "OPP_ID", **{"asof_" + c_: "opp_" + c_ for c_ in FCOLS}}), on=["season", "OPP_ID", "GAME_ID"], how="left")
pg["is_home"] = (pg["TEAM_ID"] == pg["home_id"]).astype(float)
pg = pg.sort_values(["season", "PLAYER_ID", "GAME_DATE"]).reset_index(drop=True)
pg["prev_gd"] = pg.groupby(["season", "PLAYER_ID"])["GAME_DATE"].shift(1)
pg["is_b2b"] = [(1.0 if (isinstance(p_, date) and (g_ - p_).days == 1) else 0.0) for g_, p_ in zip(pg["GAME_DATE"], pg["prev_gd"])]
LG = {c_: float(tf[c_].mean()) for c_ in FCOLS}
pg["f_pace"] = np.log(np.sqrt(pg["own_pace"].fillna(LG["PACE"]) * pg["opp_PACE"].fillna(LG["PACE"])) / LG["PACE"])
def _lf(col_, lg_): return np.log(pg[col_].fillna(lg_).clip(lower=1e-3) / lg_)
pg["f_opp_def"] = _lf("opp_DEF_RATING", LG["DEF_RATING"])
pg["f_opp_miss"] = np.log((1 - pg["opp_EFG_PCT"].fillna(LG["EFG_PCT"])) / (1 - LG["EFG_PCT"]))
pg["f_opp_oreb"] = _lf("opp_OREB_PCT", LG["OREB_PCT"])
pg["f_opp_tov"] = _lf("opp_TM_TOV_PCT", LG["TM_TOV_PCT"])
pg["f_opp_forced"] = _lf("opp_OPP_TOV_PCT", LG["OPP_TOV_PCT"])
pg["f_opp_ftr"] = _lf("opp_FTA_RATE", LG["FTA_RATE"])
pg["f_opp_fouls"] = _lf("opp_OPP_FTA_RATE", LG["OPP_FTA_RATE"])
pg["f_opp_paint"] = _lf("opp_PCT_PTS_PAINT", LG["PCT_PTS_PAINT"])
pg["f_opp_3pa"] = _lf("opp_allowed_3pa_share", LG["allowed_3pa_share"])
FACTORS_BY_PROP = {
    "points": ["f_pace", "f_opp_def", "is_home", "is_b2b"], "rebounds": ["f_pace", "f_opp_miss", "f_opp_oreb", "is_home", "is_b2b"],
    "assists": ["f_pace", "f_opp_def", "is_home", "is_b2b"], "threes_made": ["f_pace", "f_opp_3pa", "is_home", "is_b2b"],
    "blocks": ["f_pace", "f_opp_paint", "is_home", "is_b2b"], "steals": ["f_pace", "f_opp_tov", "is_home", "is_b2b"],
    "turnovers": ["f_pace", "f_opp_forced", "is_home", "is_b2b"], "fga": ["f_pace", "is_home", "is_b2b"], "fg3a": ["f_pace", "f_opp_3pa", "is_home", "is_b2b"],
    "ftm": ["f_pace", "f_opp_fouls", "is_home", "is_b2b"], "personal_fouls": ["f_pace", "f_opp_ftr", "is_home", "is_b2b"]}
FACTORS_ON = os.environ.get("BT_FACTORS", "1") == "1"
FACTOR_FITS = {}


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


def nb_cdf_zadj(k, mean, var, p0_actual):
    """Zero-adjusted NegBin (blocks/steals): P(0) replaced by the mean band's real zero rate fit on TRAIN
    inside the run (blocks ~1.5bpg: actual 0.32 vs NegBin 0.27; steals zero-deflated at low means), rest rescaled."""
    if mean <= 0: return 1.0
    if var <= mean * 1.02:
        pmf0 = float(stats.poisson.pmf(0, mean)); cdf_k = float(stats.poisson.cdf(k, mean))
    else:
        r = mean * mean / (var - mean); p = r / (r + mean)
        pmf0 = float(stats.nbinom.pmf(0, r, p)); cdf_k = float(stats.nbinom.cdf(k, r, p))
    if k < 0: return 0.0
    if k == 0: return p0_actual
    return p0_actual + (cdf_k - pmf0) * (1 - p0_actual) / max(1 - pmf0, 1e-9)


def nb_cdf(k, mean, var):
    if mean <= 0: return 1.0
    if var <= mean * 1.02:
        return float(stats.poisson.cdf(k, mean))
    r = mean * mean / (var - mean); p = r / (r + mean)
    return float(stats.nbinom.cdf(k, r, p))

reliab = []
for prop, cfg in PROPS.items():
    if BT_PROPS and prop not in BT_PROPS.split(","): continue
    col = cfg["col"]
    df = pg.copy()
    rate_col = cfg.get("att_col", col)
    df["per36"] = np.where(df["MINF"] > 0, df[rate_col] / df["MINF"] * 36, np.nan)
    gg = df.groupby(["season", "PLAYER_ID"])
    if cfg["family"] == "compound":
        df["ew_makes"] = gg[col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"], adjust=False, min_periods=3).mean())
        df["ew_att"] = gg[rate_col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"], adjust=False, min_periods=3).mean())
    if CARRY:
        CARRY_N = float(os.environ.get("BT_CARRY_N", "8"))
        df = df.sort_values(["PLAYER_ID", "GAME_DATE"])
        gp2 = df.groupby("PLAYER_ID")
        df["rate36"] = gp2["per36"].transform(lambda s: ewma_prior(s, cfg["alpha"]))
        df["n_in_season"] = gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
        df["n_total"] = gp2["per36"].transform(lambda s: s.shift(1).notna().cumsum())
        df["n_rate"] = np.minimum(df["n_total"], df["n_in_season"] + CARRY_N)
        df = df.sort_values(["season", "PLAYER_ID", "GAME_DATE"]); gg = df.groupby(["season", "PLAYER_ID"])
    else:
        df["rate36"] = gg["per36"].transform(lambda s: ewma_prior(s, cfg["alpha"]))
        df["n_rate"] = gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
    df["prior_var"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).var())
    df["prior_mean"] = gg[col].transform(lambda s: s.shift(1).rolling(20, min_periods=8).mean())
    df["ym"] = pd.to_datetime(df["GAME_DATE"]).dt.to_period("M").astype(str)
    valid = df["rate36"].notna() & df["proj_min"].notna() & (df["proj_min"] >= 8)
    d = df[valid].copy()
    # ROLE-AWARE TIER PRIOR: rate tiers ranked WITHIN role tier.
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
    # FACTOR MULTIPLIER (log-rate; coefficients fit on TRAIN by least squares of ln((y+0.5)/(mean+0.5)) on the
    # prop's factor set; centered features, so beta~0 means the factor is not needed - nothing forced).
    if FACTORS_ON:
        fc = FACTORS_BY_PROP[prop]
        X_all = d[fc].astype(float).fillna(0.0).values
        trm = d["season"].isin(TRAIN).values & (d["proj_mean"].values > 0.2)
        X = X_all[trm]; yv = np.log((d[col].values[trm] + 0.5) / (d["proj_mean"].values[trm] + 0.5))
        mu_x = X.mean(axis=0); Xc = X - mu_x
        beta, *_ = np.linalg.lstsq(np.c_[np.ones(len(Xc)), Xc], yv, rcond=None)
        beta = beta[1:]
        FACTOR_FITS[prop] = {f_: round(float(b_), 4) for f_, b_ in zip(fc, beta)}
        mult = np.exp(np.clip((X_all - mu_x) @ beta, -0.35, 0.35))
        d["proj_mean"] = d["proj_mean"] * mult
        if cfg["family"] == "compound": d["proj_att"] = d["proj_att"] * mult
        print(f"{prop} factor betas (log-rate per unit): {FACTOR_FITS[prop]}")
    # heteroscedastic dispersion prior by mean band (TRAIN), player-level shrunk k=10; prediction interval sqrt(1+1/n)
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
    # BAND MEAN-CALIBRATION CELLS (fit on VALIDATION 2024-25 via bandfit.py; applied only for props in BAND_CELL_PROPS
    # per the season-consistency rule; each ratio shrunk toward 1.0 by cell n with k=300)
    BAND_RATIO = {"points": {"FRINGE": 1.1221, "ROLE": 0.9942, "STAR": 0.9926, "STARTER": 1.003, "SUPERSTAR": 1.0102},
                  "rebounds": {"ELITE": 1.0756, "HIGH": 0.9738, "LOW": 1.0641, "MID": 0.9695},
                  "assists": {"ELITE": 1.0772, "HIGH": 0.9946, "LOW": 1.059, "MID": 0.9975},
                  "threes_made": {"ELITE": 0.7566, "HIGH": 0.9687, "LOW": 1.0555, "MID": 1.0695}}
    BAND_N = {"points": {"FRINGE": 9029, "ROLE": 7320, "STAR": 898, "STARTER": 3333, "SUPERSTAR": 31},
              "rebounds": {"ELITE": 1071, "HIGH": 3190, "LOW": 5628, "MID": 10722},
              "assists": {"ELITE": 292, "HIGH": 2456, "LOW": 9755, "MID": 8108},
              "threes_made": {"ELITE": 161, "HIGH": 4470, "LOW": 8359, "MID": 7621}}
    VBANDS = VBANDS_ALL[prop]
    _pre_band = [next((kk for lo, hi, kk in VBANDS if lo <= a < hi), "ELITE") for a in np.floor(d["proj_mean"]) + 0.5]
    _ratio = np.array([(BAND_N[prop][b] * BAND_RATIO[prop][b] + 300.0) / (BAND_N[prop][b] + 300.0) for b in _pre_band]) if prop in BAND_CELL_PROPS else np.ones(len(d))
    d["proj_mean"] = d["proj_mean"] * _ratio
    if cfg["family"] == "compound": d["proj_att"] = d["proj_att"] * _ratio
    # SEASON-PHASE CELL (design factor 'season_phase'; measured 2026-09-09 on BOTH seasons: carryover over-projects
    # ~5pp at the anchor in October, ~2-4 in November, flat Dec-Mar, under-projects 5-7 in April). Ratio actual/projected
    # mean by month-of-season, fit on train seasons that themselves had a predecessor in the data, shrunk toward 1.0
    # (k=500), applied to the current season. Result on 2025-26: points October -4.8 -> -0.1, April +6.1 -> +2.3.
    if os.environ.get("BT_PHASE", "1") == "1":
        _mo = pd.to_datetime(d["GAME_DATE"]).dt.month
        d["phase"] = np.select([_mo == 10, _mo == 11, _mo == 4, _mo >= 5], ["OCT", "NOV", "APR", "MAY"], "MID")
        _fit_seasons = [s_ for s_ in TRAIN if any(x < s_ for x in TRAIN)] or TRAIN
        _trp = d[d["season"].isin(_fit_seasons)].groupby("phase").agg(a=(col, "mean"), p=("proj_mean", "mean"), n=(col, "size"))
        _trp["ratio"] = (_trp["n"] * (_trp["a"] / _trp["p"]) + 500.0) / (_trp["n"] + 500.0)
        PHASE_RATIO = _trp["ratio"].to_dict()
        FACTOR_FITS.setdefault("season_phase", {})[prop] = {k: round(float(v), 4) for k, v in PHASE_RATIO.items()}
        d["proj_mean"] = d["proj_mean"] * d["phase"].map(PHASE_RATIO).fillna(1.0)
        if cfg["family"] == "compound": d["proj_att"] = d["proj_att"] * d["phase"].map(PHASE_RATIO).fillna(1.0)
    d["anchor"] = np.floor(d["proj_mean"]) + 0.5
    if os.environ.get("BT_SAVE_COMPONENTS", "0") == "1":
        d[["season", "PLAYER_ID", "GAME_ID", "GAME_DATE", "TEAM_ID", "role_tier", "tier", "proj_min", "proj_mean", "proj_var", "anchor", col]].rename(columns={col: "actual"}).to_pickle(OUT / f"_comp_{prop}_{TEST[0]}.pkl")
    d["var_band"] = [next((k for lo, hi, k in VBANDS if lo <= a < hi), "ELITE") for a in d["anchor"]]
    EMP_MIN = 300
    d["ym_dt"] = pd.to_datetime(d["GAME_DATE"]).dt.to_period("M")
    # ZERO-ADJUSTMENT TABLE (blocks/steals): actual P(0) by projected-mean band, fit on TRAIN inside the run.
    Z_BANDS = [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 99]
    if cfg.get("zero_adjust"):
        _z = d[d["season"].isin(TRAIN)]
        p0_by_band = (_z[col] == 0).groupby(pd.cut(_z["proj_mean"], Z_BANDS), observed=False).mean()
        d["p0_band"] = pd.cut(d["proj_mean"], Z_BANDS).map(p0_by_band).astype(float)
        d["p0_band"] = d["p0_band"].fillna(np.exp(-d["proj_mean"]))
    def param_p_over(fr, off):
        line_ = (fr["anchor"] + off * cfg["step"]).clip(lower=0.5); k_ = np.floor(line_).astype(int)
        if cfg.get("zero_adjust"):
            return 1 - np.array([nb_cdf_zadj(kk, m, v, z) for kk, m, v, z in zip(k_, fr["proj_mean"], fr["proj_var"], fr["p0_band"])])
        if cfg["family"] == "compound":
            av = np.maximum(fr["proj_att"] * 1.6, fr["proj_att"] + 1e-6)
            pu = np.array([compound_cdf(kk, a, v, pc) for kk, a, v, pc in zip(k_, fr["proj_att"], av, fr["make_pct"])])
        else:
            un = (cfg["family"] == "auto") & (fr["proj_mean"] >= 10)
            pu = np.where(un, stats.norm.cdf(line_, fr["proj_mean"], np.sqrt(fr["proj_var"])), [nb_cdf(kk, m, v) for kk, m, v in zip(k_, fr["proj_mean"], fr["proj_var"])])
        return 1 - pu
    if prop in SHIFT_MODE_PROPS:
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1): d[f"pp_{off}"] = param_p_over(d, off)
    test_all = d[d["season"].isin(TEST)]
    emp_hits = 0
    for month, test in test_all.groupby("ym_dt"):   # walk-forward monthly rebuild
        hist = d[(d["season"].isin(TRAIN) | (d["ym_dt"] < month)) & d["tier"].notna()]
        # HIERARCHICAL EMPIRICAL TABLES: L1 tier x role x rung -> L2 band x role x rung -> L3 band x rung
        emp, emp2, emp3 = {}, {}, {}
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line_tr = (hist["anchor"] + off * cfg["step"]).clip(lower=0.5)
            hit = (hist[col] > line_tr).astype(int)
            key = pd.DataFrame({"t": hist["tier"].values, "r": hist["role_tier"].values, "v": hist["var_band"].values, "hit": hit.values,
                                "pp": hist[f"pp_{off}"].values if prop in SHIFT_MODE_PROPS else np.nan})
            for (t, r), row in key.groupby(["t", "r"]).agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                if row["count"] >= EMP_MIN: emp[(int(t), r, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
            for (v, r), row in key.groupby(["v", "r"]).agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                if row["count"] >= EMP_MIN: emp2[(v, r, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
            for v, row in key.groupby("v").agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                if row["count"] >= EMP_MIN: emp3[(v, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
            line = (test["anchor"] + off * cfg["step"]).clip(lower=0.5)
            k_int = np.floor(line).astype(int)
            use_normal = (cfg["family"] == "auto") & (test["proj_mean"] >= 10)
            if cfg.get("zero_adjust"):
                p_under = np.array([nb_cdf_zadj(kk, m, v, z) for kk, m, v, z in zip(k_int, test["proj_mean"], test["proj_var"], test["p0_band"])])
            elif cfg["family"] == "compound":
                att_var = np.maximum(test["proj_att"] * 1.6, test["proj_att"] + 1e-6)
                p_under = np.array([compound_cdf(kk, a, av, pc) for kk, a, av, pc in zip(k_int, test["proj_att"], att_var, test["make_pct"])])
            else:
                p_under = np.where(use_normal,
                                   stats.norm.cdf(line, test["proj_mean"], np.sqrt(test["proj_var"])),
                                   [nb_cdf(kk, m, v) for kk, m, v in zip(k_int, test["proj_mean"], test["proj_var"])])
            p_param = 1 - p_under
            n_g = test["n_rate"].clip(lower=1).values.astype(float)
            ceiling = np.minimum(0.99, 0.99 - 0.30 * np.exp(-n_g / 25))   # UPPER ceiling only
            p_param = np.minimum(p_param, ceiling)
            small = n_g < 30
            if small.any():
                z = 1.96; ph = p_param[small]; nn = n_g[small]
                center = (ph + z * z / (2 * nn)) / (1 + z * z / nn)
                margin = z * np.sqrt(ph * (1 - ph) / nn + z * z / (4 * nn * nn)) / (1 + z * z / nn)
                p_param[small] = np.clip(ph, np.maximum(0, center - margin), np.minimum(1, center + margin))
            K_CELL = K_CELL_BY_PROP.get(prop, 300.0)
            p_over = np.array(p_param, dtype=float); used = np.zeros(len(test), dtype=bool)
            t_arr = [int(t) if t is not None and not (isinstance(t, float) and np.isnan(t)) else -1 for t in test["tier"]]
            _lg = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
            _sg = lambda x: 1 / (1 + np.exp(-x))
            shift_mode = prop in SHIFT_MODE_PROPS
            for i, (t, r, v) in enumerate(zip(t_arr, test["role_tier"], test["var_band"])):
                base = p_param[i]
                levels = (emp3.get((v, off)), emp2.get((v, r, off)), emp.get((t, r, off)))
                if shift_mode:
                    # LEVEL shift on the parametric (keeps within-cell ordering). Finest available level ONLY -
                    # stacking the three levels tripled the correction.
                    fine = next((c for c in reversed(levels) if c), None)
                    if fine:
                        used[i] = True; w = fine[1] / (fine[1] + K_CELL); lam = SHIFT_LAMBDA.get(prop, 1.0)
                        # cell level + lam * (parametric deviation from the cell's mean parametric) + shrunk observed gap
                        base = _sg(_lg(fine[2]) + lam * (_lg(base) - _lg(fine[2])) + w * (_lg(fine[0]) - _lg(fine[2])))
                else:
                    for c in levels:   # REPLACEMENT, chained coarse -> fine, each shrunk k/(k+n)
                        if not c: continue
                        used[i] = True
                        base = (c[1] * c[0] + K_CELL * base) / (c[1] + K_CELL)
                p_over[i] = base
            p_emp = np.where(used, p_over, np.nan)
            emp_hits += int(used.sum())
            actual_over = (test[col] > line).astype(int).values
            rel = pd.DataFrame({"prop": prop, "offset": off, "p_over": p_over, "p_param": p_param, "actual": actual_over, "anchor": test["anchor"].values, "line": line.values, "PLAYER_ID": test["PLAYER_ID"].values, "GAME_ID": test["GAME_ID"].values, "season": test["season"].values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": ~np.isnan(p_emp), "month": str(month)})
            reliab.append(rel)
    test = test_all
    print(f"{prop}: empirical cell coverage {emp_hits / (len(test) * (2 * LADDER_STEPS + 1)):.1%} of test predictions, {len(emp)} cells")
rel = pd.concat(reliab, ignore_index=True)
rel.to_pickle(OUT / "_rel_stage1.pkl")

# STAGE 2 --------------------------------------------------------- PLATT per (prop, band, role, rung), pooled fallback
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
_pools = {k: g for k, g in rel.groupby(["prop", "var_band", "offset"])}
for (prop, vb, role, off), grp in rel.groupby(["prop", "var_band", "role_tier", "offset"]):
    pool_all = _pools[(prop, vb, off)]
    for m in sorted(grp["month_dt"].unique()):
        hist = grp[grp["month_dt"] < m]
        cur_idx = grp.index[grp["month_dt"] == m]
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
        platt_log.append({"prop": prop, "var_band": vb, "role_tier": role, "offset": int(off), "month": str(m), "A": round(float(A), 4), "B": round(float(B), 4), "n_fit": int(len(hist)), "max_shift": round(float(shift), 4)})
platt_df = pd.DataFrame(platt_log)
if os.environ.get("BT_SAVE_COMPONENTS", "0") == "1":
    # calibrated marginal P(over 9.5) (post-Platt) for the double-double joint threshold in combos_ladder_v1.py
    for prop_ in rel["prop"].unique():
        rel[(rel["prop"] == prop_) & (rel["line"] == 9.5)][["season", "PLAYER_ID", "GAME_ID", "p_over"]].rename(columns={"p_over": "p_ge10"}).to_pickle(OUT / f"_p10_{prop_}_{TEST[0]}.pkl")

def brier(p, y): return float(np.mean((p - y) ** 2))
def logloss(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
summary = []
for prop, grp in rel.groupby("prop"):
    for off, g2 in grp.groupby("offset"):
        summary.append({"prop": prop, "offset": int(off), "n": int(len(g2)), "mean_pred": round(float(g2["p_over"].mean()), 4), "actual_over": round(float(g2["actual"].mean()), 4), "gap_pp": round(100 * (float(g2["actual"].mean()) - float(g2["p_over"].mean())), 2), "brier": round(brier(g2["p_over"].values, g2["actual"].values), 4), "brier_param_only": round(brier(g2["p_param"].values, g2["actual"].values), 4), "logloss": round(logloss(g2["p_over"].values, g2["actual"].values), 4), "emp_share": round(float(g2["used_emp"].mean()), 3)})
summary = pd.DataFrame(summary)
# SEASON-SHAPE table: calibration + coverage by month of the test season (opening weeks and April are their own regimes)
_pg_test = pg[pg["season"].isin(TEST)].copy(); _pg_test["ym"] = pd.to_datetime(_pg_test["GAME_DATE"]).dt.to_period("M").astype(str)
_games_by_month = _pg_test.groupby("ym").size()
mb = []
for (prop, m), g2 in rel.groupby(["prop", "month"]):
    anchor = g2[g2["offset"] == 0]
    legs_ = pd.concat([g2.assign(p_side=g2["p_over"], hit=g2["actual"]), g2.assign(p_side=1 - g2["p_over"], hit=1 - g2["actual"])])
    legs_ = legs_[legs_["p_side"] >= 0.5]; legs_["band"] = pd.cut(legs_["p_side"], [0.5, 0.6, 0.7, 0.8, 0.9, 1.01], right=False)
    bb = legs_.groupby("band", observed=True).agg(n=("hit", "size"), p=("p_side", "mean"), h=("hit", "mean")); bb = bb[bb["n"] >= 300]
    mb.append({"prop": prop, "month": m, "projected": int(len(anchor)), "player_games": int(_games_by_month.get(m, 0)), "coverage": round(len(anchor) / max(1, _games_by_month.get(m, 1)), 3),
               "anchor_gap_pp": round(100 * (anchor["actual"].mean() - anchor["p_over"].mean()), 2), "worst_band_gap_pp": round(float((100 * (bb["h"] - bb["p"])).abs().max()) if len(bb) else float("nan"), 1), "platt_share": round(float((g2["p_over"] != g2["p_raw"]).mean()), 2)})
month_table = pd.DataFrame(mb).sort_values(["prop", "month"])
rel["bin"] = pd.cut(rel["p_over"], bins=np.linspace(0, 1, 11), include_lowest=True)
reliability = rel.groupby(["prop", "bin"], observed=True).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), actual=("actual", "mean")).reset_index()
reliability["gap_pp"] = 100 * (reliability["actual"] - reliability["mean_pred"])
by_role = rel[rel["offset"] == 0].groupby(["prop", "role_tier"]).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), mean_raw=("p_raw", "mean"), actual=("actual", "mean")).reset_index()
by_role["gap_pp"] = 100 * (by_role["actual"] - by_role["mean_pred"]); by_role["gap_raw_pp"] = 100 * (by_role["actual"] - by_role["mean_raw"])

# LEG-LEVEL (owner standard)
more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"])
less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])
legs = pd.concat([more, less], ignore_index=True)
legs = legs[(legs["line"] > 0.5) | (legs["side"] == "more")]
CONF_EDGES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0001]
CONF_LABELS = ["50-55", "55-60", "60-65", "65-70", "70-75", "75-80", "80-85", "85-90", "90-95", "95+"]
legs["conf_band"] = pd.cut(legs["p_side"], bins=CONF_EDGES, labels=CONF_LABELS, right=False)
conf = legs[legs["p_side"] >= 0.5].groupby(["prop", "side", "conf_band"], observed=True).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index()
conf["gap_pp"] = 100 * (conf["hit_rate"] - conf["mean_pred"])
vbd = legs.groupby(["prop", "var_band", "side", "offset"]).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index()
vbd["gap_pp"] = 100 * (vbd["hit_rate"] - vbd["mean_pred"])
worst = vbd[(vbd["gap_pp"].abs() > 2.5) & (vbd["n"] >= 500)].sort_values("gap_pp", key=lambda x: -x.abs())
vb_conf = legs[legs["p_side"] >= 0.5].groupby(["prop", "var_band", "side", "conf_band"], observed=True).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index()
vb_conf["gap_pp"] = 100 * (vb_conf["hit_rate"] - vb_conf["mean_pred"])
vb_conf_worst = vb_conf[(vb_conf["gap_pp"].abs() > 2.5) & (vb_conf["n"] >= 500)].sort_values("gap_pp", key=lambda x: -x.abs())

report = {"factor_fits": FACTOR_FITS, "leg_level": {"confidence_bands_by_prop_side": json.loads(conf.astype({"conf_band": str}).to_json(orient="records")),
                        "variation_x_direction_x_rung": json.loads(vbd.to_json(orient="records")),
                        "worst_cells_gap_gt_2p5_n_ge_500": json.loads(worst.to_json(orient="records")),
                        "variation_x_direction_x_confidence_worst": json.loads(vb_conf_worst.astype({"conf_band": str}).to_json(orient="records"))},
          "platt_fits": json.loads(platt_df.to_json(orient="records")) if len(platt_df) else [], "role_minutes_multiplier_train_fit": {k: round(float(v), 4) for k, v in ROLE_MIN_MULT.items()}, "generated_at": str(date.today()), "train_seasons": TRAIN, "test_season": TEST, "props": [p for p in PROPS if not BT_PROPS or p in BT_PROPS.split(",")], "ladder_steps": LADDER_STEPS,
          "per_offset": json.loads(summary.to_json(orient="records")),
          "reliability_deciles": json.loads(reliability.astype({"bin": str}).to_json(orient="records")),
          "anchor_by_role_tier": json.loads(by_role.to_json(orient="records"))}
_suffix = f"{TAG}_{TEST[0]}" + (f"_{BT_PROPS.replace(',', '-')}" if BT_PROPS else "")
(OUT / f"classification_{_suffix}.json").write_text(json.dumps(report, indent=2, default=str))
md = [f"# Classification + ladder calibration {TAG} ({date.today()}) — out-of-sample {TEST}, history {TRAIN}", "", "## Season shape (calibration + coverage by month)", "| prop | month | projected | player-games | coverage | anchor gap pp | worst band gap pp | platt share |", "|---|---|---|---|---|---|---|---|"]
for _, r in month_table.iterrows(): md.append(f"| {r['prop']} | {r['month']} | {int(r['projected'])} | {int(r['player_games'])} | {r['coverage']:.3f} | {r['anchor_gap_pp']:+.2f} | {r['worst_band_gap_pp']} | {r['platt_share']:.2f} |")
md.append("")
for prop in [p for p in PROPS if not BT_PROPS or p in BT_PROPS.split(",")]:
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
md += ["", "# LEG-LEVEL CALIBRATION", "", "## Confidence bands (chosen side), by prop x side"]
for prop in [p for p in PROPS if not BT_PROPS or p in BT_PROPS.split(",")]:
    for side in ("more", "less"):
        c = conf[(conf["prop"] == prop) & (conf["side"] == side)]
        md += [f"### {prop} / {side}", "| conf band | n | mean pred | hit rate | gap pp |", "|---|---|---|---|---|"]
        for _, r in c.iterrows(): md.append(f"| {r['conf_band']} | {int(r['n'])} | {100*r['mean_pred']:.1f} | {100*r['hit_rate']:.1f} | {r['gap_pp']:+.1f} |")
md += ["", "## Worst variation x direction x rung cells (|gap| > 2.5pp, n >= 500)", "| prop | var band | side | rung | n | pred | hit | gap pp |", "|---|---|---|---|---|---|---|---|"]
for _, r in worst.head(40).iterrows(): md.append(f"| {r['prop']} | {r['var_band']} | {r['side']} | {int(r['offset']):+d} | {int(r['n'])} | {100*r['mean_pred']:.1f} | {100*r['hit_rate']:.1f} | {r['gap_pp']:+.1f} |")
if len(worst) == 0: md.append("| (none) | | | | | | | |")
md += ["", "## Worst variation x direction x confidence-band cells (|gap| > 2.5pp, n >= 500)", "| prop | var band | side | conf | n | pred | hit | gap pp |", "|---|---|---|---|---|---|---|---|"]
for _, r in vb_conf_worst.head(40).iterrows(): md.append(f"| {r['prop']} | {r['var_band']} | {r['side']} | {r['conf_band']} | {int(r['n'])} | {100*r['mean_pred']:.1f} | {100*r['hit_rate']:.1f} | {r['gap_pp']:+.1f} |")
if len(vb_conf_worst) == 0: md.append("| (none) | | | | | | | |")
(OUT / f"classification_{_suffix}.md").write_text("\n".join(md)); print("\n".join(md))
