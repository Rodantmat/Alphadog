#!/usr/bin/env python3
"""
NBA Backtest — Step 4: PERIOD PROPS (1Q, 1H, 2H, 4Q) on the same recipe.

Data: nba/data/nba_player_game_log_q{1..4}_{season}.json (scrape_nba_periods.py) + the full-game log.
Design §5 (period rows): 1Q is the cleanest prop (starters ~full quarter; minutes mixture collapses); 1H adds the
dud component; 2H/4Q carry the full mixture and blowout risk in BOTH directions; OT: PrizePicks/Underdog include
OT in 2H/4Q, Sleeper quarter markets exclude it. Full-game minus Q1..Q4 = the player's OT contribution, so both
app rules are evaluated from the same data.

Model per period p: outcome_p = minutes_p x rate_p/36, where
  minutes_p  = player's backward EWMA of period minutes (competitive games), adjusted by P(blowout) x E[ratio | role, won/lost]
               (the blowout ratio is measured on the PERIOD's own history - it is ~1.0 for Q1 and large for Q4)
  rate_p     = player's per-36 EWMA IN THAT PERIOD (1Q usage != full-game usage - measured, not assumed)
Then: role tier (full-game minutes), rate tier within role (period rate), hierarchical empirical tables rebuilt
monthly (walk-forward), per-rung Platt, leg-level report. Stats: points, rebounds, assists, 3PM.
Env: BT_TRAIN, BT_TEST, BT_PERIODS (subset of q1,h1,h2,q4), BT_OT (include|exclude; default include for h2/q4),
BT_PROPS (subset of points,rebounds,assists,threes_made), BT_SHIFT_LAMBDA (0 = replacement cells; 1 = parametric ordering).
Run one (period, prop) at a time in Actions (~8 min each).

FIRST RESULTS (2026-09-09, 2025-26, OT include):
  MEASURED blowout Q-minute ratios by role (won/lost): Q1 starters ~1.00 (blowout irrelevant in Q1 - confirmed);
  Q4 IRON_MAN 0.37/0.38, STARTER 0.51/0.55, ROTATION 0.84/0.77, BENCH 1.32/1.25, FRINGE 2.40/2.51.
  points_q1: ladder 1.1, 0 band misses -> AT STANDARD on the first pass (the cleanest prop, as designed).
  rebounds_q1: ladder 0.8 but under-confident on both sides (+3..+5) - short-period counts are under-dispersed
  (near-binomial); floor lowered to 0.5, but in replacement mode the parametric cannot reach the output.
  points_q4 / rebounds_q4: ladder 0.8/0.7 aggregate, but the HIGH band (stars, n=940) is +/-6..8.5 at every rung.
  Two-state mixture (normal/blowout means) did not help; full shift mode (lambda=1) made bands WORSE (-5..-10 on
  more 70-90). MEASURED star Q4 minutes by state: close 9.0 (sd 2.5, 3% sit), medium 7.6 (sd 3.2, 9% sit),
  blowout 3.5 (sd 3.3, 40-47% SIT OUT ENTIRELY). The blowout state is itself a mixture -> a star's Q4 needs the
  design's THIRD component: a point mass at zero with state-dependent weight (3/9/45%) + a 'plays' component with
  state-dependent mean and its own dispersion (Q4 pts var/mean 3.2-4.3). NEXT: implement that 3-part Q4/H2 mixture.
"""
import json, math, os
from datetime import date
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats

DATA = Path("nba/data"); OUT = Path("nba/backtest/reports"); OUT.mkdir(parents=True, exist_ok=True)
TRAIN = os.environ.get("BT_TRAIN", "2023-24,2024-25").split(","); TEST = [os.environ.get("BT_TEST", "2025-26")]; SEASONS = TRAIN + TEST
SLUG = {s: s.replace("-", "_") for s in SEASONS}
PERIODS = os.environ.get("BT_PERIODS", "q1,h1,h2,q4").split(","); OT_MODE = os.environ.get("BT_OT", "include")
BT_PROPS = os.environ.get("BT_PROPS", "points,rebounds,assists,threes_made").split(",")
SHIFT_LAMBDA = float(os.environ.get("BT_SHIFT_LAMBDA", "0.5"))   # evidence: 0.5 for q1/q4 (0 = replacement was under-confident; 1 over-confident)
PROPS = {"points": ("PTS", 0.12, 25), "rebounds": ("REB", 0.08, 40), "assists": ("AST", 0.15, 20), "threes_made": ("FG3M", 0.12, 25)}
ROLE_TIERS = [("IRON_MAN", 36, 99), ("HIGH_USAGE_STARTER", 32, 36), ("STARTER", 27, 32), ("ROTATION", 21, 27), ("BENCH", 15, 21), ("FRINGE", 0, 15)]
MAX_TIERS, MIN_PER_TIER, TIER_BLEND_K, LADDER_STEPS, EMP_MIN, K_CELL, BLOWOUT_MARGIN, COMPETITIVE_MARGIN = 24, 15, 5, 6, 300, 300.0, 20, 15


def role_tier(m):
    for k, lo, hi in ROLE_TIERS:
        if lo <= m < hi: return k
    return "FRINGE"


def to_min(v):
    if v is None or (isinstance(v, float) and math.isnan(v)): return np.nan
    if isinstance(v, str) and ":" in v:
        m, s = v.split(":"); return float(m) + float(s) / 60
    try: return float(v)
    except Exception: return np.nan


def load(path): return pd.DataFrame(json.loads(Path(path).read_text()).get("records", []))


full, qs, teams, teams_adv = [], {1: [], 2: [], 3: [], 4: []}, [], []
for s in SEASONS:
    f = load(DATA / f"nba_player_game_log_{SLUG[s]}.json"); f["season"] = s; full.append(f)
    for q in (1, 2, 3, 4):
        x = load(DATA / f"nba_player_game_log_q{q}_{SLUG[s]}.json"); x["season"] = s; qs[q].append(x)
    t = load(DATA / f"nba_team_game_log_{SLUG[s]}.json"); t["season"] = s; teams.append(t)
    ta = load(DATA / f"nba_team_game_log_advanced_{SLUG[s]}.json"); ta["season"] = s; teams_adv.append(ta)
full = pd.concat(full, ignore_index=True); teams = pd.concat(teams, ignore_index=True); teams_adv = pd.concat(teams_adv, ignore_index=True)
KEY = ["season", "PLAYER_ID", "GAME_ID"]
for df in (full, teams): df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
for df in (full, teams, teams_adv): df["GAME_ID"] = df["GAME_ID"].astype(str); df["TEAM_ID"] = df["TEAM_ID"].astype(str)
full["PLAYER_ID"] = full["PLAYER_ID"].astype(str)
full["MINF"] = full["MIN"].apply(to_min)
for c in ["PTS", "REB", "AST", "FG3M", "PF"]: full[c] = pd.to_numeric(full[c], errors="coerce").fillna(0)
base = full[KEY + ["GAME_DATE", "TEAM_ID", "MATCHUP", "MINF", "PTS", "REB", "AST", "FG3M", "PF"]].rename(columns={c: f"{c}_full" for c in ["MINF", "PTS", "REB", "AST", "FG3M", "PF"]})
for q in (1, 2, 3, 4):
    x = pd.concat(qs[q], ignore_index=True); x["GAME_ID"] = x["GAME_ID"].astype(str); x["PLAYER_ID"] = x["PLAYER_ID"].astype(str)
    x["MINF"] = x["MIN"].apply(to_min)
    for c in ["PTS", "REB", "AST", "FG3M", "PF"]: x[c] = pd.to_numeric(x[c], errors="coerce").fillna(0)
    base = base.merge(x[KEY + ["MINF", "PTS", "REB", "AST", "FG3M", "PF"]].rename(columns={c: f"{c}_q{q}" for c in ["MINF", "PTS", "REB", "AST", "FG3M", "PF"]}), on=KEY, how="left")
for c in ["MINF", "PTS", "REB", "AST", "FG3M", "PF"]:
    for q in (1, 2, 3, 4): base[f"{c}_q{q}"] = base[f"{c}_q{q}"].fillna(0)
    base[f"{c}_ot"] = (base[f"{c}_full"] - sum(base[f"{c}_q{q}"] for q in (1, 2, 3, 4))).clip(lower=0)
    base[f"{c}_h1"] = base[f"{c}_q1"] + base[f"{c}_q2"]
    base[f"{c}_h2"] = base[f"{c}_q3"] + base[f"{c}_q4"] + (base[f"{c}_ot"] if OT_MODE == "include" else 0)
    base[f"{c}_q4ot"] = base[f"{c}_q4"] + (base[f"{c}_ot"] if OT_MODE == "include" else 0)
print("period frame:", len(base), "| OT player-rows:", int((base["MINF_ot"] > 0).sum()))
print("sanity Q1 minutes: mean", round(base["MINF_q1"].mean(), 2), "max", round(base["MINF_q1"].max(), 2), "| Q4 max", round(base["MINF_q4"].max(), 2))
PCOL = {"q1": "q1", "h1": "h1", "h2": "h2", "q4": "q4ot"}

teams["is_home"] = teams["MATCHUP"].str.contains("vs."); teams["margin"] = pd.to_numeric(teams["PLUS_MINUS"], errors="coerce")
teams_adv["NET_RATING"] = pd.to_numeric(teams_adv["NET_RATING"], errors="coerce")
teams_adv = teams_adv.merge(teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE"]], on=["season", "TEAM_ID", "GAME_ID"], how="inner").sort_values(["season", "TEAM_ID", "GAME_DATE"])
teams_adv["pre_net"] = teams_adv.groupby(["season", "TEAM_ID"])["NET_RATING"].transform(lambda s: s.shift(1).expanding().mean())
teams_adv["pre_n"] = teams_adv.groupby(["season", "TEAM_ID"]).cumcount()
teams_adv["pre_net_shrunk"] = teams_adv["pre_net"].fillna(0) * (teams_adv["pre_n"] / (teams_adv["pre_n"] + 10))
tg = teams.merge(teams_adv[["season", "TEAM_ID", "GAME_ID", "pre_net_shrunk"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
home = tg[tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk", "margin"]].rename(columns={"TEAM_ID": "home_id", "pre_net_shrunk": "home_net", "margin": "home_margin"})
away = tg[~tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk"]].rename(columns={"TEAM_ID": "away_id", "pre_net_shrunk": "away_net"})
games = home.merge(away, on=["season", "GAME_ID"], how="inner")
_trg = games[games["season"].isin(TRAIN)]
HCA = float((_trg["home_margin"] - (_trg["home_net"] - _trg["away_net"])).mean())
games["derived_spread"] = (games["home_net"] - games["away_net"]) + HCA
games["abs_margin"] = games["home_margin"].abs()
BINS = [0, 2, 4, 6, 8, 10, 12, 15, 99]
_trg = games[games["season"].isin(TRAIN)]
_bl = (_trg["abs_margin"] >= BLOWOUT_MARGIN).groupby(pd.cut(_trg["derived_spread"].abs(), bins=BINS, include_lowest=True), observed=False).mean()
P_BLOWOUT = [float(v) if not np.isnan(v) else 0.2 for v in _bl.values]
games["p_blowout"] = pd.cut(games["derived_spread"].abs(), bins=BINS, labels=P_BLOWOUT, include_lowest=True, ordered=False).astype(float)
_cl = (_trg["abs_margin"] < 8).groupby(pd.cut(_trg["derived_spread"].abs(), bins=BINS, include_lowest=True), observed=False).mean()
P_CLOSE = [float(v) if not np.isnan(v) else 0.4 for v in _cl.values]
games["p_close"] = pd.cut(games["derived_spread"].abs(), bins=BINS, labels=P_CLOSE, include_lowest=True, ordered=False).astype(float)
games["home_favored"] = games["derived_spread"] > 0
# P(OT | spread) fit on TRAIN: OT games detected via any player OT minutes in the period frame
_ot_games = set(base.loc[base["MINF_ot"] > 0.5, ["season", "GAME_ID"]].itertuples(index=False, name=None))
games["is_ot"] = [1.0 if (s_, g_) in _ot_games else 0.0 for s_, g_ in zip(games["season"], games["GAME_ID"])]
_trg = games[games["season"].isin(TRAIN)]
_po = _trg["is_ot"].groupby(pd.cut(_trg["derived_spread"].abs(), bins=BINS, include_lowest=True), observed=False).mean()
P_OT = [float(v) if not np.isnan(v) else 0.05 for v in _po.values]   # measured: 5.3% at pick'em -> 1.9% at 15+
games["p_ot"] = pd.cut(games["derived_spread"].abs(), bins=BINS, labels=P_OT, include_lowest=True, ordered=False).astype(float)
pg = base.merge(games[["season", "GAME_ID", "home_id", "home_margin", "abs_margin", "p_blowout", "p_close", "p_ot", "home_favored"]], on=["season", "GAME_ID"], how="inner")
pg["team_margin"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_margin"], -pg["home_margin"])
pg["favored"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_favored"], ~pg["home_favored"])
pg = pg.sort_values(["season", "PLAYER_ID", "GAME_DATE"]).reset_index(drop=True)
pg["competitive"] = pg["abs_margin"] < COMPETITIVE_MARGIN
g = pg.groupby(["season", "PLAYER_ID"])
pg["comp_min_full"] = np.where(pg["competitive"] & (pg["PF_full"] < 6), pg["MINF_full"], np.nan)
pg["mu_role"] = g["comp_min_full"].transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
pg["role_tier"] = pg["mu_role"].apply(lambda m: role_tier(m) if not np.isnan(m) else None)
pg["won_bl"] = pg["team_margin"] >= BLOWOUT_MARGIN; pg["lost_bl"] = pg["team_margin"] <= -BLOWOUT_MARGIN


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
def nb_cdf(k, mean, var):
    if mean <= 0: return 1.0
    if var <= mean * 1.02: return float(stats.poisson.cdf(k, mean))
    r = mean * mean / (var - mean); p = r / (r + mean); return float(stats.nbinom.cdf(k, r, p))


reliab = []; findings = {}
for per in PERIODS:
    pc = PCOL[per]; mcol = f"MINF_{pc}"
    pg[f"comp_{per}"] = np.where(pg["competitive"] & (pg["PF_full"] < 6), pg[mcol], np.nan)
    pg[f"mu_{per}"] = pg.groupby(["season", "PLAYER_ID"])[f"comp_{per}"].transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
    _t = pg[pg["season"].isin(TRAIN) & pg[f"mu_{per}"].notna() & (pg[f"mu_{per}"] > 1)]
    ratio = {}
    for rt, _lo, _hi in ROLE_TIERS:
        w = (_t[(_t["role_tier"] == rt) & _t["won_bl"]][mcol] / _t[(_t["role_tier"] == rt) & _t["won_bl"]][f"mu_{per}"]).mean()
        l = (_t[(_t["role_tier"] == rt) & _t["lost_bl"]][mcol] / _t[(_t["role_tier"] == rt) & _t["lost_bl"]][f"mu_{per}"]).mean()
        ratio[rt] = (float(w) if not np.isnan(w) else 1.0, float(l) if not np.isnan(l) else 1.0)
    findings[f"{per}_blowout_minutes_ratio_by_role"] = {k: (round(v[0], 3), round(v[1], 3)) for k, v in ratio.items()}
    rr = np.array([(ratio[r][0] if f_ else ratio[r][1]) if r in ratio else 1.0 for r, f_ in zip(pg["role_tier"], pg["favored"])])
    pb = pg["p_blowout"].fillna(0.2).values
    pg[f"pm_{per}"] = pg[f"mu_{per}"] * ((1 - pb) + pb * rr)
    pg[f"pm_{per}_norm"] = pg[f"mu_{per}"]; pg[f"pm_{per}_blow"] = pg[f"mu_{per}"] * rr; pg[f"pb_{per}"] = pb
    # 3-PART MIXTURE (design third component; measured 2026-09-09): per role x game state, the SIT-OUT rate
    # (period minutes < 3) and the plays-ratio (period minutes / mu | played), fit on TRAIN.
    # Q4 Iron Man: close 3% sit / 1.07x, medium 8% / 0.89x, blowout 45% / 0.64x; fringe blowout 18% / 2.9x.
    _t2 = pg[pg["season"].isin(TRAIN) & pg[f"mu_{per}"].notna() & (pg[f"mu_{per}"] > 1)].copy()
    _t2["state"] = np.select([_t2["abs_margin"] >= BLOWOUT_MARGIN, _t2["abs_margin"] < 8], ["blowout", "close"], "medium")
    _t2["sit"] = (_t2[mcol] < 3).astype(float); _t2["ratio"] = _t2[mcol] / _t2[f"mu_{per}"]
    S3 = {}
    for rt, _lo, _hi in ROLE_TIERS:
        for st in ("close", "medium", "blowout"):
            sub = _t2[(_t2["role_tier"] == rt) & (_t2["state"] == st)]
            sit = float(sub["sit"].mean()) if len(sub) >= 30 else 0.05
            plays = sub[sub[mcol] >= 3]; pr_ = float(plays["ratio"].mean()) if len(plays) >= 30 else 1.0
            S3[(rt, st)] = (sit, pr_)
    findings[f"{per}_3state_by_role"] = {f"{k[0]}|{k[1]}": (round(v[0], 3), round(v[1], 3)) for k, v in S3.items()}
    pcl = pg["p_close"].fillna(0.4).values; pmed = np.clip(1 - pb - pcl, 0.02, 1)
    for st, pst in (("close", pcl), ("medium", pmed), ("blowout", pb)):
        pg[f"p_{st}_{per}"] = pst
        pg[f"sit_{st}_{per}"] = [S3.get((r, st), (0.05, 1.0))[0] for r in pg["role_tier"]]
        pg[f"pr_{st}_{per}"] = [S3.get((r, st), (0.05, 1.0))[1] for r in pg["role_tier"]]
    for prop in BT_PROPS:
        col, alpha, kst = PROPS[prop]; ycol = f"{col}_{pc}"
        df = pg.copy()
        df["per36"] = np.where(df[mcol] > 0, df[ycol] / df[mcol] * 36, np.nan)
        gg = df.groupby(["season", "PLAYER_ID"])
        df["rate36"] = gg["per36"].transform(lambda s: s.shift(1).ewm(alpha=alpha, adjust=False, min_periods=3).mean())
        df["n_rate"] = gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
        df["prior_var"] = gg[ycol].transform(lambda s: s.shift(1).rolling(20, min_periods=8).var()); df["prior_mean"] = gg[ycol].transform(lambda s: s.shift(1).rolling(20, min_periods=8).mean())
        df["ym"] = pd.to_datetime(df["GAME_DATE"]).dt.to_period("M")
        d = df[df["rate36"].notna() & df[f"pm_{per}"].notna() & (df[f"pm_{per}"] >= 2) & df["role_tier"].notna()].copy()
        d["ym_s"] = d["ym"].astype(str)
        tp = {}
        for (s, ym, role), grp in d.groupby(["season", "ym_s", "role_tier"]):
            pop = grp.groupby("PLAYER_ID")["rate36"].last(); n = len(pop); tt = max(1, min(MAX_TIERS, n // MIN_PER_TIER))
            ranks = pop.rank(pct=True, method="first"); tier_of = np.minimum(tt, np.floor(ranks * tt) + 1).astype(int)
            tm = pop.groupby(tier_of).mean(); tn = pop.groupby(tier_of).size(); pm = pop.mean()
            for pid, t in tier_of.items(): tp[(s, ym, role, pid)] = (int(t), (tn[t] * tm[t] + TIER_BLEND_K * pm) / (tn[t] + TIER_BLEND_K))
        d["tier"] = [tp.get((s, y_, r, p), (None, np.nan))[0] for s, y_, r, p in zip(d["season"], d["ym_s"], d["role_tier"], d["PLAYER_ID"])]
        d["tier_prior"] = [tp.get((s, y_, r, p), (None, np.nan))[1] for s, y_, r, p in zip(d["season"], d["ym_s"], d["role_tier"], d["PLAYER_ID"])]
        # prior strength scaled by period length: a quarter's per-36 rate carries ~1/3 of a game's information
        K_SCALE = {"q1": 3.0, "q4": 3.0, "h1": 1.5, "h2": 1.5}[per] * float(os.environ.get("BT_KSCALE", "1.0"))
        n = d["n_rate"].clip(lower=1); d["shr36"] = (n * d["rate36"] + kst * K_SCALE * d["tier_prior"]) / (n + kst * K_SCALE)
        d["mean"] = d["shr36"] * d[f"pm_{per}"] / 36
        d["mean_norm"] = d["shr36"] * d[f"pm_{per}_norm"] / 36; d["mean_blow"] = d["shr36"] * d[f"pm_{per}_blow"] / 36
        for st in ("close", "medium", "blowout"):
            d[f"mean_{st}"] = d["shr36"] * d[f"mu_{per}"] * d[f"pr_{st}_{per}"] / 36   # mean given PLAYS in that state
        d["mean_sit"] = d["shr36"] * 1.0 / 36   # ~1 minute of production when sitting most of the period
        _tr = d[d["season"].isin(TRAIN)].dropna(subset=["prior_var", "prior_mean"]); _iod = (_tr["prior_var"] / _tr["prior_mean"].clip(lower=0.25))
        _b = [0, 1, 2, 4, 6, 8, 12, 16, 200]; iod_band = _iod.groupby(pd.cut(_tr["prior_mean"], _b)).median()
        iod_prior = pd.cut(d["mean"], _b).map(iod_band).astype(float).fillna(float(_iod.median()))
        iod_p = (d["prior_var"] / d["prior_mean"].clip(lower=0.25)); n_i = d["prior_var"].notna().astype(float) * 20.0
        iod = ((n_i * iod_p.fillna(0) + 10.0 * iod_prior) / (n_i + 10.0)).clip(0.5, 8.0)   # short-period counts can be under-dispersed
        d["iod"] = iod * (1 + 1 / n)
        d["var"] = np.maximum(d["mean"] * d["iod"], 1e-6)
        d["anchor"] = np.floor(d["mean"]) + 0.5
        d["var_band"] = pd.cut(d["anchor"], [0, 2.5, 5.5, 9.5, 99], labels=["LOW", "MID", "HIGH", "ELITE"]).astype(str)
        def _cdf(k_, m_, v_):
            if m_ <= 0: return 1.0
            if v_ < m_ * 0.98:
                p_ = 1 - v_ / m_; nn = max(1, int(round(m_ / p_))); return float(stats.binom.cdf(k_, nn, min(0.999, m_ / nn)))
            return nb_cdf(k_, m_, v_)
        def param_p_over(fr, off):
            line_ = (fr["anchor"] + off).clip(lower=0.5); k_ = np.floor(line_).astype(int); io = fr["iod"].values
            if per in ("q4", "h2"):
                # P(under) = sum_state P(state) * [ sit_state * P(under | sit) + (1 - sit_state) * P(under | plays in state) ]
                p_sit = np.array([_cdf(kk, m, max(m * 1.2, m + 1e-6)) for kk, m in zip(k_, fr["mean_sit"])])
                tot = np.zeros(len(fr))
                for st in ("close", "medium", "blowout"):
                    ps = fr[f"p_{st}_{per}"].values; sit = fr[f"sit_{st}_{per}"].values
                    pp_ = np.array([_cdf(kk, m, m * i) for kk, m, i in zip(k_, fr[f"mean_{st}"], io)])
                    tot += ps * (sit * p_sit + (1 - sit) * pp_)
                return 1 - tot
            return 1 - np.array([_cdf(kk, m, v) for kk, m, v in zip(k_, fr["mean"], fr["var"])])
        for off in range(-LADDER_STEPS, LADDER_STEPS + 1): d[f"pp_{off}"] = param_p_over(d, off)
        test_all = d[d["season"].isin(TEST)]
        for month, test in test_all.groupby("ym"):
            hist = d[(d["season"].isin(TRAIN) | (d["ym"] < month)) & d["tier"].notna()]
            emp, emp2, emp3 = {}, {}, {}
            for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
                line_tr = (hist["anchor"] + off).clip(lower=0.5); hit = (hist[ycol] > line_tr).astype(int)
                key = pd.DataFrame({"t": hist["tier"].values, "r": hist["role_tier"].values, "v": hist["var_band"].values, "hit": hit.values, "pp": hist[f"pp_{off}"].values})
                for (t, r), row in key.groupby(["t", "r"]).agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                    if row["count"] >= EMP_MIN: emp[(int(t), r, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
                for (v, r), row in key.groupby(["v", "r"]).agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                    if row["count"] >= EMP_MIN: emp2[(v, r, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
                for v, row in key.groupby("v").agg(mean=("hit", "mean"), count=("hit", "size"), pp=("pp", "mean")).iterrows():
                    if row["count"] >= EMP_MIN: emp3[(v, off)] = (float(row["mean"]), int(row["count"]), float(row["pp"]))
            _lg = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4))); _sg = lambda x: 1 / (1 + np.exp(-x))
            for off in range(-LADDER_STEPS, LADDER_STEPS + 1):
                line = (test["anchor"] + off).clip(lower=0.5)
                p_param = test[f"pp_{off}"].values.astype(float)
                n_g = test["n_rate"].clip(lower=1).values.astype(float); p_param = np.minimum(p_param, np.minimum(0.99, 0.99 - 0.30 * np.exp(-n_g / 25)))
                p_over = np.array(p_param, dtype=float); used = np.zeros(len(test), dtype=bool)
                t_arr = [int(t) if t is not None and not (isinstance(t, float) and np.isnan(t)) else -1 for t in test["tier"]]
                for i, (t, r, v) in enumerate(zip(t_arr, test["role_tier"], test["var_band"])):
                    b_ = p_param[i]
                    levels = (emp3.get((v, off)), emp2.get((v, r, off)), emp.get((t, r, off)))
                    if SHIFT_LAMBDA > 0:
                        fine = next((c for c in reversed(levels) if c), None)
                        if fine:
                            used[i] = True; w = fine[1] / (fine[1] + K_CELL)
                            b_ = _sg(_lg(fine[2]) + SHIFT_LAMBDA * (_lg(b_) - _lg(fine[2])) + w * (_lg(fine[0]) - _lg(fine[2])))
                    else:
                        for c in levels:
                            if not c: continue
                            used[i] = True; b_ = (c[1] * c[0] + K_CELL * b_) / (c[1] + K_CELL)
                    p_over[i] = b_
                reliab.append(pd.DataFrame({"prop": f"{prop}_{per}", "offset": off, "p_over": p_over, "p_param": p_param, "actual": (test[ycol] > line).astype(int).values, "anchor": test["anchor"].values, "line": line.values, "role_tier": test["role_tier"].values, "var_band": test["var_band"].values, "used_emp": used, "month": str(month)}))
        print(f"{prop}_{per} done; period rate36 mean {d['rate36'].mean():.2f}")
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

more = rel.assign(side="more", p_side=rel["p_over"], hit=rel["actual"]); less = rel.assign(side="less", p_side=1 - rel["p_over"], hit=1 - rel["actual"])
legs = pd.concat([more, less], ignore_index=True); legs = legs[(legs["line"] > 0.5) | (legs["side"] == "more")]
CONF_EDGES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0001]; CONF_LABELS = ["50-55", "55-60", "60-65", "65-70", "70-75", "75-80", "80-85", "85-90", "90-95", "95+"]
legs["conf_band"] = pd.cut(legs["p_side"], bins=CONF_EDGES, labels=CONF_LABELS, right=False)
conf = legs[legs["p_side"] >= 0.5].groupby(["prop", "side", "conf_band"], observed=True).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index(); conf["gap_pp"] = 100 * (conf["hit_rate"] - conf["mean_pred"])
summary = rel.groupby(["prop", "offset"]).agg(n=("actual", "size"), mean_pred=("p_over", "mean"), actual_over=("actual", "mean")).reset_index(); summary["gap_pp"] = 100 * (summary["actual_over"] - summary["mean_pred"])
vbd = legs.groupby(["prop", "var_band", "side", "offset"]).agg(n=("hit", "size"), mean_pred=("p_side", "mean"), hit_rate=("hit", "mean")).reset_index(); vbd["gap_pp"] = 100 * (vbd["hit_rate"] - vbd["mean_pred"])
worst = vbd[(vbd["gap_pp"].abs() > 2.5) & (vbd["n"] >= 500)].sort_values("gap_pp", key=lambda x: -x.abs())
md = [f"# Period props ({date.today()}) — out-of-sample {TEST}, history {TRAIN}, OT={OT_MODE}, shift_lambda={SHIFT_LAMBDA}", "", f"Findings: {json.dumps(findings)}", ""]
for prop in summary["prop"].unique():
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
_tag = "_".join(PERIODS) + "_" + "_".join(BT_PROPS)
(OUT / f"periods_{TEST[0]}_{OT_MODE}_{_tag}.md").write_text("\n".join(md)); print("\n".join(md))
