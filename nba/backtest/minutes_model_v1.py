#!/usr/bin/env python3
"""
NBA Backtest Harness — Step 1: the MINUTES MODEL (everything multiplies through it).

Runs on GitHub Actions against the committed JSON data (no DB access needed). Strictly
backward-looking: every pre-game feature uses only games BEFORE that game's date.

What this run establishes (per nba/NBA_CLASSIFICATION_BASELINE_DESIGN.md §3.1 + §8):
  1. DERIVED SPREAD  = pre-game rolling net-rating differential + home court (fit) + rest diff.
  2. P(BLOWOUT | derived spread) lookup, fit on TRAIN seasons, checked on the walk-forward season.
  3. DATASTREAK REPRODUCTION: over-rate proxy (player outcome > own trailing-10 median) by final
     margin bucket. Published: 46.7 / 44.9 / 43.8 / 40.9 for <=7 / 8-14 / 15-19 / 20+.
  4. MINUTES MIXTURE COMPONENTS per player: competitive mu/sigma, dud rate, E[min | blowout] by
     role tier and starter flag, team-specific blowout pull rates.
  5. B2B VALIDATION: minutes delta on 0 days rest by role tier and age bucket vs published ranges
     (veterans -1.5..-3.0, young stars -0.5..-1.5, bench ~0). Sign-error detector, not a value source.
Outputs: nba/backtest/reports/minutes_model_v1.json + .md

FIRST-RUN FINDINGS (2026-09-09, local dry run on real data - recorded here so the code carries
its own history):
  - Derived spread reaches market-grade accuracy with zero market data: r=0.44 train / 0.46 test
    vs final margin, MAE 11.5. HCA fit 1.98 (modern NBA, consistent with recent research).
  - P(blowout|spread) is monotone 0.17 -> 0.39 on train and transfers to test (0.19 -> 0.41).
  - DataStreak decay reproduces: ours 49.9/48.2/46.8/44.5 (5.4 pts) vs published 46.7/44.9/43.8/40.9
    (5.8 pts). Level differs because our "line" is a fair trailing median, not a vig-shaded book line.
  - CORRECTION TO THE SEEDS: WON blowouts are NOT a penalty on average (51.9% vs 49.1% competitive)
    - LOST blowouts are (36.9%). DataStreak's aggregate curve blends two very different states.
    Blowout cells must be split by won/lost; favored starters 47.7% vs underdog starters 39.4%.
  - CORRECTION TO PUBLISHED B2B RANGES: stars on 0 rest show ~0 to -0.4 min when they PLAY, not
    -1.5..-3.0; bench/rotation GAIN +0.6..+2.5. Mechanism: stars are often rested entirely on B2Bs
    (DNP-Rest), so the star B2B effect is a P(available) effect, and the bench gains are the
    redistribution. Moves the star B2B factor into the P(start)/availability model.
  - Team-specific starter pull in won blowouts spans 0.81 (Orlando) to 1.10 (Dallas) - a 30%
    spread, validating team-specific E[min|blowout].
  - ANOMALY TO INVESTIGATE (not explained away): FRINGE ratio 0.867 in WON blowouts (<1, expected >1
    for garbage-time accumulators). Possibly the >=40%-of-median filter inflating fringe mu_role.
"""
import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path("nba/data")
OUT = Path("nba/backtest/reports")
OUT.mkdir(parents=True, exist_ok=True)

TRAIN = ["2023-24", "2024-25"]
TEST = ["2025-26"]
SEASONS = TRAIN + TEST
SLUG = {s: s.replace("-", "_") for s in SEASONS}
BLOWOUT_MARGIN = 20
COMPETITIVE_MARGIN = 15
ROLE_TIERS = [("IRON_MAN", 36, 99), ("HIGH_USAGE_STARTER", 32, 36), ("STARTER", 27, 32), ("ROTATION", 21, 27), ("BENCH", 15, 21), ("FRINGE", 0, 15)]


def load_records(path):
    return pd.DataFrame(json.loads(Path(path).read_text()).get("records", []))


def role_tier(m):
    for k, lo, hi in ROLE_TIERS:
        if lo <= m < hi:
            return k
    return "FRINGE"


# ---------------------------------------------------------------- load
players, teams, teams_adv = [], [], []
for s in SEASONS:
    p = load_records(DATA / f"nba_player_game_log_{SLUG[s]}.json"); p["season"] = s; players.append(p)
    t = load_records(DATA / f"nba_team_game_log_{SLUG[s]}.json"); t["season"] = s; teams.append(t)
    ta = load_records(DATA / f"nba_team_game_log_advanced_{SLUG[s]}.json"); ta["season"] = s; teams_adv.append(ta)
players = pd.concat(players, ignore_index=True)
teams = pd.concat(teams, ignore_index=True)
teams_adv = pd.concat(teams_adv, ignore_index=True)

for df in (players, teams):
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
for df in (players, teams, teams_adv):
    df["GAME_ID"] = df["GAME_ID"].astype(str)
    df["TEAM_ID"] = df["TEAM_ID"].astype(str)
# The advanced team file carries no GAME_DATE (keyed by GAME_ID only) - join it from the base log.
teams_adv = teams_adv.merge(teams[["season", "TEAM_ID", "GAME_ID", "GAME_DATE"]], on=["season", "TEAM_ID", "GAME_ID"], how="inner")


def to_min(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return np.nan
    if isinstance(v, str) and ":" in v:
        m, s = v.split(":"); return float(m) + float(s) / 60
    try:
        return float(v)
    except Exception:
        return np.nan
players["MINF"] = players["MIN"].apply(to_min)
players["PF"] = pd.to_numeric(players["PF"], errors="coerce").fillna(0)
players["PTS"] = pd.to_numeric(players["PTS"], errors="coerce").fillna(0)
players["is_home"] = players["MATCHUP"].str.contains("vs.")
teams["is_home"] = teams["MATCHUP"].str.contains("vs.")
teams["PLUS_MINUS"] = pd.to_numeric(teams["PLUS_MINUS"], errors="coerce")
teams["margin"] = teams["PLUS_MINUS"]
teams_adv["NET_RATING"] = pd.to_numeric(teams_adv["NET_RATING"], errors="coerce")

ss = json.loads((DATA / "nba_starter_status_2025_26.json").read_text()).get("rows", [])
starter = {(str(r["player_id"]), str(r["game_id"])): int(r["is_starter"]) for r in ss}
players["PLAYER_ID"] = players["PLAYER_ID"].astype(str)
players["is_starter"] = [starter.get((pid, gid), np.nan) for pid, gid in zip(players["PLAYER_ID"], players["GAME_ID"])]

# Real bio schema: {"players":[{player_id, age, ...}]} (not records/PLAYER_ID/AGE - first run had every age NaN)
bio = json.loads((DATA / "nba_player_bio_current.json").read_text()).get("players", [])
age_by_pid = {str(b.get("player_id")): b.get("age") for b in bio if b.get("player_id")}
players["age"] = pd.to_numeric(players["PLAYER_ID"].map(age_by_pid), errors="coerce")

# ---------------------------------------------------------------- 1. derived spread (backward-looking)
teams_adv = teams_adv.sort_values(["season", "TEAM_ID", "GAME_DATE"])
teams_adv["pre_net"] = teams_adv.groupby(["season", "TEAM_ID"])["NET_RATING"].transform(lambda s: s.shift(1).expanding().mean())
teams_adv["pre_n"] = teams_adv.groupby(["season", "TEAM_ID"]).cumcount()
K = 10
teams_adv["pre_net_shrunk"] = teams_adv["pre_net"].fillna(0) * (teams_adv["pre_n"] / (teams_adv["pre_n"] + K))

teams = teams.sort_values(["season", "TEAM_ID", "GAME_DATE"])
teams["prev_date"] = teams.groupby(["season", "TEAM_ID"])["GAME_DATE"].shift(1)
teams["rest_days"] = [(g - p).days - 1 if isinstance(p, date) else np.nan for g, p in zip(teams["GAME_DATE"], teams["prev_date"])]

tg = teams.merge(teams_adv[["season", "TEAM_ID", "GAME_ID", "pre_net_shrunk"]], on=["season", "TEAM_ID", "GAME_ID"], how="left")
home = tg[tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk", "rest_days", "margin"]].rename(columns={"TEAM_ID": "home_id", "pre_net_shrunk": "home_net", "rest_days": "home_rest", "margin": "home_margin"})
away = tg[~tg["is_home"]][["season", "GAME_ID", "TEAM_ID", "pre_net_shrunk", "rest_days"]].rename(columns={"TEAM_ID": "away_id", "pre_net_shrunk": "away_net", "rest_days": "away_rest"})
games = home.merge(away, on=["season", "GAME_ID"], how="inner")
games["rest_diff"] = (games["home_rest"].fillna(2) - games["away_rest"].fillna(2)).clip(-3, 3)

_tr = games[games["season"].isin(TRAIN)]
hca = float((_tr["home_margin"] - (_tr["home_net"] - _tr["away_net"])).mean())
games["derived_spread"] = (games["home_net"] - games["away_net"]) + hca + 0.5 * games["rest_diff"]
games["abs_margin"] = games["home_margin"].abs()
games["blowout"] = (games["abs_margin"] >= BLOWOUT_MARGIN).astype(int)
games["abs_spread"] = games["derived_spread"].abs()
train_g = games[games["season"].isin(TRAIN)]

# ---------------------------------------------------------------- 2. P(blowout | |spread|) lookup
bins = [0, 2, 4, 6, 8, 10, 12, 15, 99]
labels = ["0-2", "2-4", "4-6", "6-8", "8-10", "10-12", "12-15", "15+"]
games["spread_bin"] = pd.cut(games["abs_spread"], bins=bins, labels=labels, include_lowest=True)
lookup = train_g.assign(spread_bin=pd.cut(train_g["abs_spread"], bins=bins, labels=labels, include_lowest=True)).groupby("spread_bin", observed=True)["blowout"].agg(["mean", "count"]).reset_index()
test_g = games[games["season"].isin(TEST)]
lookup_test = test_g.groupby("spread_bin", observed=True)["blowout"].agg(["mean", "count"]).reset_index()
spread_corr_train = float(np.corrcoef(train_g["derived_spread"], train_g["home_margin"])[0, 1])
spread_corr_test = float(np.corrcoef(test_g["derived_spread"], test_g["home_margin"])[0, 1])
spread_mae_test = float((test_g["derived_spread"] - test_g["home_margin"]).abs().mean())

# ---------------------------------------------------------------- 3. DataStreak reproduction
players = players.sort_values(["season", "PLAYER_ID", "GAME_DATE"])
players["trail_med_pts"] = players.groupby(["season", "PLAYER_ID"])["PTS"].transform(lambda s: s.shift(1).rolling(10, min_periods=5).median())
players["trail_med_min"] = players.groupby(["season", "PLAYER_ID"])["MINF"].transform(lambda s: s.shift(1).rolling(10, min_periods=5).median())
gm = games[["season", "GAME_ID", "abs_margin", "home_margin", "home_id", "derived_spread"]]
pg = players.merge(gm, on=["season", "GAME_ID"], how="inner")
pg["team_margin"] = np.where(pg["TEAM_ID"] == pg["home_id"], pg["home_margin"], -pg["home_margin"])
pg["margin_bucket"] = pd.cut(pg["abs_margin"], bins=[-1, 7, 14, 19, 200], labels=["<=7", "8-14", "15-19", "20+"])
eligible = pg[pg["trail_med_pts"].notna() & (pg["trail_med_min"] >= 15)]
eligible = eligible.assign(over=(eligible["PTS"] > eligible["trail_med_pts"]).astype(int))
ds_curve = eligible.groupby("margin_bucket", observed=True)["over"].agg(["mean", "count"]).reset_index()
e26 = eligible[(eligible["season"] == "2025-26") & (eligible["is_starter"] == 1)].copy()
e26["favored"] = ((e26["TEAM_ID"] == e26["home_id"]) & (e26["derived_spread"] > 0)) | ((e26["TEAM_ID"] != e26["home_id"]) & (e26["derived_spread"] < 0))
fav_split = e26[e26["abs_margin"] >= BLOWOUT_MARGIN].groupby("favored")["over"].agg(["mean", "count"]).reset_index()
eligible["won_blowout"] = eligible["team_margin"] >= BLOWOUT_MARGIN
eligible["lost_blowout"] = eligible["team_margin"] <= -BLOWOUT_MARGIN
wl_split = pd.DataFrame({
    "state": ["competitive(<15)", "won_blowout(20+)", "lost_blowout(20+)"],
    "over_rate": [eligible[eligible["abs_margin"] < 15]["over"].mean(), eligible[eligible["won_blowout"]]["over"].mean(), eligible[eligible["lost_blowout"]]["over"].mean()],
    "n": [int((eligible["abs_margin"] < 15).sum()), int(eligible["won_blowout"].sum()), int(eligible["lost_blowout"].sum())],
})

# ---------------------------------------------------------------- 4. minutes mixture components
pg["role_tier"] = pg["trail_med_min"].apply(lambda m: role_tier(m) if not np.isnan(m) else None)
pg["won_blowout"] = (pg["team_margin"] >= BLOWOUT_MARGIN)
pg["lost_blowout"] = (pg["team_margin"] <= -BLOWOUT_MARGIN)
pg["competitive"] = pg["abs_margin"] < COMPETITIVE_MARGIN
comp_mask = pg["competitive"] & (pg["PF"] < 6)
# LEAKAGE FIX (2026-09-09, found via the FRINGE anomaly): mu_role was a season-wide mean, which uses
# FUTURE games and inflates fringe baselines (season mean 13.5 vs backward trailing 8.1 for the same
# games). Every baseline must be strictly backward-looking. mu_role/sigma are now a per-player
# rolling (shift(1)) mean/std over the player's PREVIOUS competitive, non-foul-out games only.
pg = pg.sort_values(["season", "PLAYER_ID", "GAME_DATE"])
pg["comp_min"] = np.where(comp_mask, pg["MINF"], np.nan)
grp = pg.groupby(["season", "PLAYER_ID"])["comp_min"]
pg["mu_role"] = grp.transform(lambda s: s.shift(1).rolling(20, min_periods=5).mean())
pg["sigma_player"] = grp.transform(lambda s: s.shift(1).rolling(20, min_periods=5).std())
player_comp = pg.dropna(subset=["mu_role"]).groupby(["season", "PLAYER_ID"]).agg(mu_role=("mu_role", "last"), sigma_player=("sigma_player", "last"), n=("comp_min", "count")).reset_index()
dud_flags = []
for (s, pid), grp in pg[pg["competitive"] & pg["trail_med_min"].notna()].groupby(["season", "PLAYER_ID"]):
    if len(grp) < 15: continue
    thr = grp["MINF"].quantile(0.15)
    d = ((grp["MINF"] <= thr) | (grp["PF"] >= 5)).mean()
    dud_flags.append((s, pid, float(d), int(len(grp))))
dud_df = pd.DataFrame(dud_flags, columns=["season", "PLAYER_ID", "dud_rate", "n"])
bw = pg[pg["mu_role"].notna() & (pg["mu_role"] > 0)].copy()
bw["min_ratio"] = bw["MINF"] / bw["mu_role"]
blow = bw[(bw["won_blowout"] | bw["lost_blowout"]) & bw["role_tier"].notna()]
blow_by_role = blow.groupby(["role_tier", "won_blowout"])["min_ratio"].agg(["mean", "count"]).reset_index()
blow26 = blow[(blow["season"] == "2025-26") & (blow["is_starter"] == 1) & blow["won_blowout"]]
team_pull = blow26.groupby("TEAM_ID")["min_ratio"].agg(["mean", "count"]).reset_index().sort_values("mean")

# ---------------------------------------------------------------- 5. B2B validation
players["prev_date"] = players.groupby(["season", "PLAYER_ID"])["GAME_DATE"].shift(1)
players["rest"] = [(g - p).days - 1 if isinstance(p, date) else np.nan for g, p in zip(players["GAME_DATE"], players["prev_date"])]
b2 = players.merge(player_comp[["season", "PLAYER_ID", "mu_role"]], on=["season", "PLAYER_ID"], how="inner")
b2 = b2.merge(gm[["season", "GAME_ID", "abs_margin"]], on=["season", "GAME_ID"], how="inner")
b2 = b2[(b2["abs_margin"] < COMPETITIVE_MARGIN) & b2["rest"].notna()]
b2["role_tier"] = b2["mu_role"].apply(role_tier)
b2["age_bucket"] = pd.cut(b2["age"], bins=[0, 25, 29, 60], labels=["<26", "26-29", "30+"])
b2["delta"] = b2["MINF"] - b2["mu_role"]
b2b = b2[b2["rest"] == 0].groupby(["role_tier", "age_bucket"], observed=True)["delta"].agg(["mean", "count"]).reset_index()
rested = b2[b2["rest"] >= 1].groupby(["role_tier", "age_bucket"], observed=True)["delta"].agg(["mean", "count"]).reset_index()
b2b_cmp = b2b.merge(rested, on=["role_tier", "age_bucket"], suffixes=("_b2b", "_rested"))
b2b_cmp["b2b_effect_min"] = b2b_cmp["mean_b2b"] - b2b_cmp["mean_rested"]

# ---------------------------------------------------------------- report
def rows(df): return json.loads(df.to_json(orient="records"))
report = {
    "generated_at": str(date.today()), "train_seasons": TRAIN, "test_seasons": TEST,
    "games": {"train": int(len(train_g)), "test": int(len(test_g)), "player_games": int(len(pg))},
    "derived_spread": {"home_court_advantage_fit": round(hca, 2), "corr_with_margin_train": round(spread_corr_train, 3), "corr_with_margin_test": round(spread_corr_test, 3), "mae_vs_margin_test": round(spread_mae_test, 2), "note": "Market spreads typically achieve r~0.35-0.45 and MAE~10-11 vs final margin; this is the static-only ceiling to compare against"},
    "p_blowout_lookup": {"train": rows(lookup), "test": rows(lookup_test), "blowout_definition": f"abs final margin >= {BLOWOUT_MARGIN}"},
    "datastreak_reproduction": {"published_over_rate": {"<=7": 46.7, "8-14": 44.9, "15-19": 43.8, "20+": 40.9}, "ours_pts_vs_trailing_median": rows(ds_curve), "favored_vs_underdog_starters_in_blowouts_2025_26": rows(fav_split), "won_vs_lost_blowout_all_players": rows(wl_split)},
    "minutes_components": {"players_with_competitive_fit": int(len(player_comp)), "median_sigma_player": round(float(player_comp["sigma_player"].median()), 2), "median_dud_rate": round(float(dud_df["dud_rate"].median()), 3), "e_min_ratio_in_blowout_by_role": rows(blow_by_role), "team_specific_starter_pull_in_won_blowouts_2025_26": rows(team_pull)},
    "b2b_validation": {"published_ranges": {"veterans_30plus_starters": "-1.5 to -3.0", "young_stars": "-0.5 to -1.5", "bench": "~0"}, "ours": rows(b2b_cmp)},
}
(OUT / "minutes_model_v1.json").write_text(json.dumps(report, indent=2, default=str))

md = [f"# Minutes model backtest v1 ({date.today()})", "",
      f"Train {TRAIN} | Test {TEST} | games train/test {len(train_g)}/{len(test_g)} | player-games {len(pg)}", "",
      "## 1. Derived spread (static only)", f"- HCA fit: {hca:.2f} pts", f"- corr(derived spread, home margin): train {spread_corr_train:.3f} / test {spread_corr_test:.3f}; MAE test {spread_mae_test:.2f}", "",
      "## 2. P(blowout | |derived spread|)", "| bin | train P | n | test P | n |", "|---|---|---|---|---|"]
lt = lookup.merge(lookup_test, on="spread_bin", how="left", suffixes=("_tr", "_te"))
for _, r in lt.iterrows():
    md.append(f"| {r['spread_bin']} | {r['mean_tr']:.3f} | {int(r['count_tr'])} | {r['mean_te']:.3f} | {int(r['count_te'])} |")
md += ["", "## 3. DataStreak reproduction (over = PTS > own trailing-10 median, >=15 min players)", "| margin | published | ours | n |", "|---|---|---|---|"]
pub = {"<=7": 46.7, "8-14": 44.9, "15-19": 43.8, "20+": 40.9}
for _, r in ds_curve.iterrows():
    md.append(f"| {r['margin_bucket']} | {pub[str(r['margin_bucket'])]} | {100*r['mean']:.1f} | {int(r['count'])} |")
md += ["", "Favored vs underdog STARTERS in 20+ blowouts (2025-26 real starter flags):"]
for _, r in fav_split.iterrows():
    md.append(f"- favored={bool(r['favored'])}: over-rate {100*r['mean']:.1f}% (n={int(r['count'])})")
md += ["", "Over-rate by game state (all seasons, all eligible players):"]
for _, r in wl_split.iterrows():
    md.append(f"- {r['state']}: {100*r['over_rate']:.1f}% (n={int(r['n'])})")
md += ["", "## 4. Minutes mixture components", f"- players with competitive fit: {len(player_comp)}; median sigma_player {player_comp['sigma_player'].median():.2f} min; median dud rate {dud_df['dud_rate'].median():.3f}", "", "E[min]/mu_role in blowouts by role tier (won vs lost):", "| role | won blowout | ratio | n |", "|---|---|---|---|"]
for _, r in blow_by_role.iterrows():
    md.append(f"| {r['role_tier']} | {bool(r['won_blowout'])} | {r['mean']:.3f} | {int(r['count'])} |")
md += ["", "Team-specific starter pull in WON blowouts 2025-26 (lowest ratio = pulls starters earliest):", "| team | ratio | n |", "|---|---|---|"]
for _, r in team_pull.head(6).iterrows(): md.append(f"| {r['TEAM_ID']} | {r['mean']:.3f} | {int(r['count'])} |")
md.append("| ... | | |")
for _, r in team_pull.tail(4).iterrows(): md.append(f"| {r['TEAM_ID']} | {r['mean']:.3f} | {int(r['count'])} |")
md += ["", "## 5. B2B validation (competitive games only; effect = mean delta on 0 rest minus mean delta rested)", "| role | age | B2B effect (min) | n_b2b | n_rested |", "|---|---|---|---|---|"]
for _, r in b2b_cmp.iterrows():
    md.append(f"| {r['role_tier']} | {r['age_bucket']} | {r['b2b_effect_min']:+.2f} | {int(r['count_b2b'])} | {int(r['count_rested'])} |")
md += ["", "Published reference: veterans 30+ starters -1.5..-3.0; young stars -0.5..-1.5; bench ~0. These are sign/magnitude sanity checks, not adopted values."]
(OUT / "minutes_model_v1.md").write_text("\n".join(md))
print("\n".join(md))
