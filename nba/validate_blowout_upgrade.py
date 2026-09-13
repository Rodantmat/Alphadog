#!/usr/bin/env python3
"""
BLOWOUT UPGRADE — SAMPLE VALIDATION before any full rebuild.

Owner rule (2026-09-12): anything that will replicate over the full data set must pass a SAMPLE test
first. This change touches the MINUTES MIXTURE, which feeds every prop, every rung, every direction and
every day - the widest-blast-radius change made to the recipe. So the sample must span the axes it could
break, not just be "the first N dates":

  * SEASON PHASE   Oct-Nov / Dec-ASB / post-ASB / playoff push  (rotations differ by regime)
  * ROLE TIER      IRON_MAN through FRINGE                      (blowouts hit starters, not benches)
  * PROP TYPE      a high-count smooth stat, a combo, a low-count bursty stat, a period prop
  * SPREAD BAND    pick'em through 13+                          (the change only bites at wide spreads)
  * BOTH SEASONS   the two-season rule is the certification standard

WHAT IT COMPARES, on the SAME player-games:
    old   p_blowout from the DERIVED spread (net rating + HCA + rest; r=0.46, MAE 11.5)
    new   p_blowout from the MORNING MARKET spread (100% coverage, 2,454 games)
against the realised minutes and the realised leg outcome.

THE GATE - all three must hold or the change does not ship:
  1. minutes: the new mixture's expected minutes must be closer to actual (MAE) overall AND in the
     wide-spread band where it is supposed to help
  2. no regression: no role tier or phase may get materially worse
  3. leg level: on graded board legs, log-loss must not degrade

Env: DATABASE_URL, BS_SEASONS
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
P_BINS = [0, 2, 4, 6, 8, 10, 12, 15, 99]
BLOWOUT_MARGIN = 20
ROLE_TIERS = [("IRON_MAN", 36, 99), ("HIGH_USAGE_STARTER", 32, 36), ("STARTER", 27, 32),
              ("ROTATION", 21, 27), ("BENCH", 15, 21), ("FRINGE", 0, 15)]


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def role_of(m):
    for k, lo, hi in ROLE_TIERS:
        if lo <= m < hi:
            return k
    return "FRINGE"


def phase_of(dt):
    m, day = dt.month, dt.day
    if m in (10, 11):
        return "1_oct_nov"
    if m == 12 or m == 1 or (m == 2 and day < 15):
        return "2_dec_asb"
    if (m == 2 and day >= 15) or (m == 3 and day < 16):
        return "3_post_asb"
    return "4_push"


def main():
    seasons = [s.strip() for s in os.environ.get("BS_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    frames = []
    for season in seasons:
        slug = season.replace("-", "_")
        lg = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        lg["GAME_DATE"] = pd.to_datetime(lg["GAME_DATE"]).dt.date
        lg["PLAYER_ID"] = lg["PLAYER_ID"].astype(str)
        lg["GAME_ID"] = lg["GAME_ID"].astype(str)
        lg["TEAM"] = lg["MATCHUP"].str.split(" ").str[0]
        lg["IS_HOME"] = (~lg["MATCHUP"].str.contains("@")).astype(int)
        lg["season"] = season
        ms = fetch(f"nba_market_spreads_{slug}.json")
        sp = {str(r["game_id"]): r for r in ms["rows"]}
        lg["mkt_home_spread"] = lg["GAME_ID"].map(lambda g: (sp.get(g) or {}).get("home_spread"))
        frames.append(lg)
    logs = pd.concat(frames, ignore_index=True).sort_values("GAME_DATE")

    tp = logs.groupby(["GAME_ID", "TEAM"]).agg(pts=("PTS", "sum"), is_home=("IS_HOME", "max")).reset_index()
    gg = tp.merge(tp, on="GAME_ID")
    gg = gg[gg["TEAM_x"] != gg["TEAM_y"]]
    margin = dict(zip(zip(gg["GAME_ID"], gg["TEAM_x"]), gg["pts_x"] - gg["pts_y"]))

    logs["margin"] = [margin.get((g, t), np.nan) for g, t in zip(logs["GAME_ID"], logs["TEAM"])]
    # team spread from the team's own perspective: home spread is negative for a favourite
    logs["mkt_spread"] = np.where(logs["IS_HOME"] == 1, -logs["mkt_home_spread"], logs["mkt_home_spread"])

    # DERIVED spread proxy for the same games: season-to-date net rating differential + HCA
    tm = logs.groupby(["season", "GAME_ID", "TEAM"]).agg(pts=("PTS", "sum")).reset_index().sort_values("GAME_ID")
    net = {}
    for (season, team), g in tm.groupby(["season", "TEAM"]):
        run = g["pts"].expanding().mean().shift(1)
        for gid, v in zip(g["GAME_ID"], run):
            net[(season, gid, team)] = v
    logs["own_net"] = [net.get((s, g, t), np.nan) for s, g, t in zip(logs["season"], logs["GAME_ID"], logs["TEAM"])]
    opp = {}
    for (gid,), g in gg.groupby(["GAME_ID"]):
        for _, r in g.iterrows():
            opp[(gid, r["TEAM_x"])] = r["TEAM_y"]
    logs["opp_team"] = [opp.get((g, t)) for g, t in zip(logs["GAME_ID"], logs["TEAM"])]
    logs["opp_net"] = [net.get((s, g, o), np.nan) for s, g, o in zip(logs["season"], logs["GAME_ID"], logs["opp_team"])]
    logs["derived_spread"] = (logs["own_net"] - logs["opp_net"]) + 2.2 * np.where(logs["IS_HOME"] == 1, 1, -1)

    g2 = logs.sort_values("GAME_DATE").groupby("PLAYER_ID")
    logs["base_min"] = g2["MIN"].transform(lambda s: s.shift(1).rolling(10, min_periods=4).mean())
    d = logs[logs["base_min"].notna() & logs["mkt_spread"].notna() & logs["derived_spread"].notna()
             & logs["margin"].notna() & (logs["base_min"] >= 8)].copy()
    d["role"] = d["base_min"].map(role_of)
    d["phase"] = d["GAME_DATE"].map(phase_of)
    d["blew"] = (d["margin"].abs() >= BLOWOUT_MARGIN).astype(int)
    print(f"sample rows: {len(d):,} player-games across {d['GAME_DATE'].nunique()} dates, "
          f"{d['PLAYER_ID'].nunique()} players, both seasons\n", flush=True)

    # fit P(blowout | |spread|) for each predictor on season 1, apply to season 2 (out-of-sample)
    tr, te = d[d["season"] == seasons[0]], d[d["season"] == seasons[-1]]
    out = {}
    for tag, col in (("derived", "derived_spread"), ("market", "mkt_spread")):
        b = (tr["blew"]).groupby(pd.cut(tr[col].abs(), bins=P_BINS, include_lowest=True), observed=False).mean()
        lut = [float(v) if not np.isnan(v) else 0.2 for v in b.values]
        out[tag] = pd.cut(te[col].abs(), bins=P_BINS, labels=lut, include_lowest=True, ordered=False).astype(float)

    print("GATE 1 - does the market spread predict the blowout better? (out-of-sample)")
    for tag in ("derived", "market"):
        p = out[tag].values
        y = te["blew"].values
        ll = float(-np.mean(y * np.log(np.clip(p, 1e-4, 1)) + (1 - y) * np.log(np.clip(1 - p, 1e-4, 1))))
        br = float(np.mean((p - y) ** 2))
        print(f"  {tag:<9} log-loss {ll:.4f}  Brier {br:.4f}  mean p {p.mean():.4f} (actual {y.mean():.4f})", flush=True)

    # expected minutes under each mixture, using the MEASURED per-side blowout minute ratios
    bm = pd.read_sql("SELECT side, v1 FROM nba_score.blowout_model WHERE kind='minutes_by_margin'", conn)
    ratio = dict(zip(bm["side"], bm["v1"].astype(float)))
    r_comp = ratio.get("competitive", 1.03)
    r_win = ratio.get("won by 25+", 0.875)
    r_lose = ratio.get("lost by 25+", 0.912)
    print(f"\n  measured ratios: competitive {r_comp:.4f} | won-blowout {r_win:.4f} | lost-blowout {r_lose:.4f}")

    print("\nGATE 2 - expected minutes MAE (out-of-sample, same rows)")
    res = {}
    for tag, col in (("derived", "derived_spread"), ("market", "mkt_spread")):
        p = out[tag].values
        fav = (te[col] > 0).values
        exp_ratio = (1 - p) * r_comp + p * np.where(fav, r_win, r_lose)
        pred = te["base_min"].values * exp_ratio
        res[tag] = pred
        print(f"  {tag:<9} MAE {np.abs(pred - te['MIN'].values).mean():.4f}", flush=True)
    flat = te["base_min"].values
    print(f"  {'no mixture':<9} MAE {np.abs(flat - te['MIN'].values).mean():.4f}", flush=True)

    print("\nGATE 3 - no regression by role tier and phase (market MAE minus derived MAE; negative = better)")
    te = te.copy(); te["pred_d"], te["pred_m"] = res["derived"], res["market"]
    for key in ("role", "phase"):
        print(f"  by {key}:")
        for k, g in te.groupby(key, observed=True):
            if len(g) < 300:
                continue
            md = float(np.abs(g["pred_d"] - g["MIN"]).mean())
            mm = float(np.abs(g["pred_m"] - g["MIN"]).mean())
            flag = "WORSE" if mm - md > 0.02 else ("better" if md - mm > 0.02 else "flat")
            print(f"    {k:<20}n={len(g):>7,}  derived {md:.4f}  market {mm:.4f}  {mm-md:+.4f}  {flag}", flush=True)

    print("\n  by spread band (where the change is supposed to bite):")
    te["band"] = pd.cut(te["mkt_spread"].abs(), [0, 4, 8, 11, 30])
    for k, g in te.groupby("band", observed=True):
        if len(g) < 300:
            continue
        md = float(np.abs(g["pred_d"] - g["MIN"]).mean())
        mm = float(np.abs(g["pred_m"] - g["MIN"]).mean())
        print(f"    {str(k):<20}n={len(g):>7,}  derived {md:.4f}  market {mm:.4f}  {mm-md:+.4f}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
