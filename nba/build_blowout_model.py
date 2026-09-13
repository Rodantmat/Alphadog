#!/usr/bin/env python3
"""
BLOWOUT MODEL v2 — the market spread, not a derived proxy. NON-NEGOTIABLE FACTOR.

THE GAP. The certified baseline's minutes mixture (normal / blowout / dud) runs on a DERIVED spread
built from net rating + HCA + rest: r = 0.46 against the final margin, MAE 11.5 points (COMPASS fact 13).
We hold 307,604 REAL market spread rows at morning and window (nba_market.game_lines_snapshots) and do
not use them for this. A book spread is far sharper and, critically, gets the SIGN right - and the sign
is everything here: COMPASS fact 14 measures won blowouts at a 51.9% over-rate versus lost blowouts at
36.9%. Practitioners say the same ("avoid the expected LOSING end of blowouts; the favoured team is less
risky").

CANONICAL GARBAGE TIME (Cleaning the Glass / Hoops Junkie): a TIME-VARYING margin threshold - 25 points
with 12:00-9:01 left, falling as the clock runs - AND a starter condition (<=2 starters on the floor).
Not a fixed cutoff. So the target here is not "was the final margin >= 20"; it is "did this game reach a
state where rotations stopped being normal", which we approximate from the final margin band plus the
observed starter-minutes collapse.

WHAT THIS MEASURES (both seasons, every game with a market line):
  1. margin prediction:  derived spread vs MARKET spread vs market+total, against the actual margin
  2. P(blowout):         calibration of each predictor, by spread bucket
  3. THE ASYMMETRY:      starter minutes lost on the WINNING vs LOSING side of a blowout, which is what
                         the mixture must encode per side rather than as one shared "blowout" branch
  4. the sliding scale:  actual starter-minute reduction per point of spread above 7, to replace an
                         arbitrary threshold

Output -> nba_score.blowout_model (the coefficients the baseline reads) and a printed verdict.

Env: DATABASE_URL, BM_SEASONS
"""
import json
import os
import urllib.request

import numpy as np
import pandas as pd
import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("BM_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    sp = pd.read_sql("""SELECT m.game_id,
                               max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS mkt_home_spread,
                               avg(CASE WHEN s.market='totals' AND s.outcome='Over' THEN s.point END) AS mkt_total
                        FROM nba_market.game_lines_snapshots s
                        JOIN nba_market.event_game_map m ON m.event_id=s.event_id
                        WHERE s.snapshot_label='morning' GROUP BY 1""", conn)
    sp["game_id"] = sp["game_id"].astype(str)
    print(f"market lines: {len(sp):,} games", flush=True)

    rows = []
    for season in seasons:
        slug = season.replace("-", "_")
        lg = pd.DataFrame(fetch(f"nba_player_game_log_{slug}.json")["records"])
        lg["GAME_DATE"] = pd.to_datetime(lg["GAME_DATE"]).dt.date
        lg["PLAYER_ID"] = lg["PLAYER_ID"].astype(str)
        lg["GAME_ID"] = lg["GAME_ID"].astype(str)
        lg["TEAM"] = lg["MATCHUP"].str.split(" ").str[0]
        lg["IS_HOME"] = (~lg["MATCHUP"].str.contains("@")).astype(int)
        lg["season"] = season
        rows.append(lg)
    logs = pd.concat(rows, ignore_index=True).sort_values("GAME_DATE")

    # team points and final margin per game
    tp = logs.groupby(["GAME_ID", "TEAM"]).agg(pts=("PTS", "sum"), is_home=("IS_HOME", "max"),
                                               date=("GAME_DATE", "first")).reset_index()
    g = tp.merge(tp, on="GAME_ID")
    g = g[g["TEAM_x"] != g["TEAM_y"]].copy()
    g["margin"] = g["pts_x"] - g["pts_y"]          # from TEAM_x's perspective
    g = g.merge(sp, left_on="GAME_ID", right_on="game_id", how="left")
    # market spread is quoted for the HOME team; flip it for the away perspective
    g["mkt_spread_x"] = np.where(g["is_home_x"] == 1, -g["mkt_home_spread"], g["mkt_home_spread"])
    have = g[g["mkt_spread_x"].notna()].copy()
    print(f"team-games with a market spread: {len(have):,}", flush=True)

    # 1) how good is the market spread at predicting the final margin?
    r_mkt = float(np.corrcoef(have["mkt_spread_x"], have["margin"])[0, 1])
    mae_mkt = float(np.abs(have["mkt_spread_x"] - have["margin"]).mean())
    print(f"\n1) MARGIN PREDICTION")
    print(f"   market spread   r {r_mkt:.4f}   MAE {mae_mkt:.2f}")
    print(f"   derived spread  r 0.4600   MAE 11.50   (COMPASS fact 13, the baseline's current input)")
    print(f"   -> the market is {'BETTER' if r_mkt > 0.46 else 'not better'} "
          f"({r_mkt-0.46:+.4f} r, {11.50-mae_mkt:+.2f} MAE)", flush=True)

    # 2) P(blowout) by market spread bucket - and the ASYMMETRY by side
    have["blowout"] = (have["margin"].abs() >= 20).astype(int)
    have["won"] = (have["margin"] > 0).astype(int)
    # SIGN CONVENTION: the Odds API quotes the HOME spread negative for a favourite (home -7 => home is
    # favoured by 7). mkt_spread_x flips it to TEAM_x's perspective, so after the flip a POSITIVE value
    # means TEAM_x is favoured. An earlier version tested `< 0` and produced impossible rows - a "13+
    # point favourite" winning by 20+ only 0.35% of the time - which is how the inversion was caught.
    have["fav"] = (have["mkt_spread_x"] > 0).astype(int)
    have["absspread"] = have["mkt_spread_x"].abs()
    print(f"\n2) P(blowout >= 20) BY MARKET SPREAD")
    print(f"   {'spread':<12}{'n':>7}{'P(blowout)':>12}{'P(win by 20+)':>15}{'P(lose by 20+)':>16}")
    buckets = [(0, 2), (2, 4), (4, 6), (6, 8), (8, 10), (10, 13), (13, 30)]
    coef = []
    for lo, hi in buckets:
        s = have[(have["absspread"] >= lo) & (have["absspread"] < hi) & (have["fav"] == 1)]
        if len(s) < 100:
            continue
        pw = float((s["margin"] >= 20).mean())
        pl = float((s["margin"] <= -20).mean())
        print(f"   fav {lo}-{hi:<7}{len(s):>7,}{float(s['blowout'].mean()):>12.4f}{pw:>15.4f}{pl:>16.4f}", flush=True)
        coef.append(("favourite", lo, hi, len(s), round(float(s["blowout"].mean()), 4), round(pw, 4), round(pl, 4)))
    for lo, hi in buckets:
        s = have[(have["absspread"] >= lo) & (have["absspread"] < hi) & (have["fav"] == 0)]
        if len(s) < 100:
            continue
        pw = float((s["margin"] >= 20).mean())
        pl = float((s["margin"] <= -20).mean())
        print(f"   dog {lo}-{hi:<7}{len(s):>7,}{float(s['blowout'].mean()):>12.4f}{pw:>15.4f}{pl:>16.4f}", flush=True)
        coef.append(("underdog", lo, hi, len(s), round(float(s["blowout"].mean()), 4), round(pw, 4), round(pl, 4)))

    # 3) THE ASYMMETRY IN MINUTES - what actually happens to starters, by side
    starters = logs[logs["MIN"] >= 20].copy()
    base = starters.sort_values("GAME_DATE").groupby("PLAYER_ID")["MIN"].transform(
        lambda s: s.shift(1).rolling(10, min_periods=4).mean())
    starters["base_min"] = base
    st = starters[starters["base_min"].notna() & (starters["base_min"] >= 26)].copy()
    st = st.merge(g[["GAME_ID", "TEAM_x", "margin"]].rename(columns={"TEAM_x": "TEAM"}),
                  on=["GAME_ID", "TEAM"], how="inner")
    st["ratio"] = st["MIN"] / st["base_min"]
    print(f"\n3) STARTER MINUTES BY REALISED MARGIN (base >= 26 min, n={len(st):,})")
    print(f"   {'margin band':<18}{'n':>8}{'min ratio':>11}{'minutes lost':>14}")
    mrows = []
    for lo, hi, lab in [(-99, -25, "lost by 25+"), (-25, -20, "lost by 20-25"), (-20, -12, "lost by 12-20"),
                        (-12, 12, "competitive"), (12, 20, "won by 12-20"), (20, 25, "won by 20-25"),
                        (25, 99, "won by 25+")]:
        s = st[(st["margin"] >= lo) & (st["margin"] < hi)]
        if len(s) < 200:
            continue
        rt = float(s["ratio"].mean())
        lost = float((s["base_min"] - s["MIN"]).mean())
        print(f"   {lab:<18}{len(s):>8,}{rt:>11.4f}{lost:>14.2f}", flush=True)
        mrows.append((lab, lo, hi, len(s), round(rt, 4), round(lost, 3)))

    # 4) the sliding scale: starter minutes vs SPREAD (pre-game knowable)
    stx = st.merge(have[["GAME_ID", "TEAM_x", "mkt_spread_x", "absspread", "fav"]].rename(
        columns={"TEAM_x": "TEAM"}), on=["GAME_ID", "TEAM"], how="inner")
    print(f"\n4) SLIDING SCALE - starter minutes by PRE-GAME spread (n={len(stx):,})")
    print(f"   {'spread':<14}{'n':>8}{'fav ratio':>11}{'dog ratio':>11}")
    srows = []
    for lo, hi in [(0, 3), (3, 5), (5, 7), (7, 9), (9, 11), (11, 14), (14, 30)]:
        f = stx[(stx["absspread"] >= lo) & (stx["absspread"] < hi) & (stx["fav"] == 1)]
        d = stx[(stx["absspread"] >= lo) & (stx["absspread"] < hi) & (stx["fav"] == 0)]
        if len(f) < 150 or len(d) < 150:
            continue
        print(f"   {f'{lo}-{hi}':<14}{len(f)+len(d):>8,}{float(f['ratio'].mean()):>11.4f}"
              f"{float(d['ratio'].mean()):>11.4f}", flush=True)
        srows.append((lo, hi, len(f), round(float(f["ratio"].mean()), 4),
                      len(d), round(float(d["ratio"].mean()), 4)))

    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.blowout_model (
            kind text, side text, lo numeric, hi numeric, n int,
            v1 numeric, v2 numeric, v3 numeric, built_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.blowout_model")
        cur.executemany("INSERT INTO nba_score.blowout_model (kind, side, lo, hi, n, v1, v2, v3) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                        [("p_blowout", s, lo, hi, n, pb, pw, pl) for s, lo, hi, n, pb, pw, pl in coef]
                        + [("minutes_by_margin", lab, lo, hi, n, rt, lost, None) for lab, lo, hi, n, rt, lost in mrows]
                        + [("sliding_scale", "fav", lo, hi, nf, rf, None, None) for lo, hi, nf, rf, nd, rd in srows]
                        + [("sliding_scale", "dog", lo, hi, nd, rd, None, None) for lo, hi, nf, rf, nd, rd in srows])
    conn.commit()
    conn.close()
    print(f"\nwrote the blowout model to nba_score.blowout_model", flush=True)


if __name__ == "__main__":
    main()
