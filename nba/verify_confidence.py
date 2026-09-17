#!/usr/bin/env python3
"""
CONFIDENCE VERIFICATION — does a leg marked "elite" actually deliver an elite rate?

COMPASS fact 5 sets TWO conditions for "extremely accurate", and only the first has ever been checked:
  (a) calibrated at the LEG level - every band x direction x rung within tolerance on BOTH seasons
  (b) CONFIDENCE BANDS HIT THEIR STATED RATE            <- never verified, until this

Confidence is not a probability, so "hitting its rate" means something specific: within a given final-HP
band, legs the engine marks high-confidence must realise closer to their stated HP than low-confidence
legs do. If elite and low legs miss by the same amount, the confidence number is decoration.

WHAT THIS MEASURES, on real graded board legs:
  1. by conf_tier x HP band:  mean final_hp vs actual hit rate, and the absolute gap
     -> a working confidence shows the gap SHRINKING as the tier rises
  2. discrimination:          |gap| for elite vs low overall, and the ratio
  3. by component:            does each pillar (existence, quality, market backing) independently
                              separate accurate legs from inaccurate ones? A pillar that does not is
                              weight we are spending for nothing.
  4. by season and phase:     the same check must hold in both seasons and every regime, or the
                              confidence is fitted to one period.

Results -> nba_score.confidence_verification so the verdict is queryable.

Env: DATABASE_URL, CV_SEASONS
"""
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, "nba")
from nba_names import norm_name  # noqa: E402

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"
PROPS = ("points", "rebounds", "assists", "threes_made", "pra", "pts_reb", "pts_ast", "reb_ast")


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    seasons = [s.strip() for s in os.environ.get("CV_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}

    frames = []
    for season in seasons:
        f = pd.read_sql("""SELECT game_date, player_id, prop, line, side, final_hp, confidence,
                                  conf_tier, c_exist, c_quality, c_market, phase
                           FROM nba_score.final_hp WHERE season=%s AND prop = ANY(%s)""",
                        conn, params=(season, list(PROPS)))
        if f.empty:
            continue
        f["game_date"] = pd.to_datetime(f["game_date"]).dt.date
        f["player_id"] = f["player_id"].astype(str)
        f["line"] = f["line"].astype(float)
        f["season"] = season
        frames.append(f)
    if not frames:
        print("no final_hp rows for these props")
        return
    f = pd.concat(frames, ignore_index=True)

    o = pd.read_sql("""SELECT game_date, player, line, side, leg_result,
                              replace(replace(market_key,'player_',''),'_alternate','') AS prop
                       FROM nba_market.board_outcomes
                       WHERE leg_result IN ('over_win','under_win')
                         AND replace(replace(market_key,'player_',''),'_alternate','') = ANY(%s)""",
                    conn, params=(list(PROPS),))
    o["game_date"] = pd.to_datetime(o["game_date"]).dt.date
    o["player_id"] = o["player"].map(norm_name).map(pid_map)
    o = o[o["player_id"].notna()]
    o["line"] = o["line"].astype(float)

    d = f.merge(o[["game_date", "player_id", "prop", "line", "side", "leg_result"]],
                on=["game_date", "player_id", "prop", "line", "side"], how="inner")
    if d.empty:
        print("no graded legs matched")
        return
    d["won"] = np.where(d["side"] == "Over", d["leg_result"] == "over_win",
                        d["leg_result"] == "under_win").astype(int)
    d["hp_band"] = pd.cut(d["final_hp"].astype(float), [0, .4, .5, .6, .7, .8, 1.01]).astype(str)
    d["final_hp"] = d["final_hp"].astype(float)
    print(f"graded legs with a confidence value: {len(d):,}\n", flush=True)

    # 1) the core test - does the gap shrink as confidence rises, WITHIN an HP band?
    print("1) GAP BETWEEN STATED HP AND REALISED RATE, by confidence tier within each HP band")
    print(f"   {'hp band':<14}{'tier':<9}{'n':>8}{'stated':>9}{'actual':>9}{'|gap|':>8}")
    rows = []
    for hb, g in d.groupby("hp_band", observed=True):
        for tier in ("low", "medium", "high", "elite"):
            s = g[g["conf_tier"] == tier]
            if len(s) < 300:
                continue
            stated, act = float(s["final_hp"].mean()), float(s["won"].mean())
            print(f"   {hb:<14}{tier:<9}{len(s):>8,}{stated:>9.4f}{act:>9.4f}{abs(act-stated):>8.4f}", flush=True)
            rows.append(("by_band_tier", hb, tier, len(s), round(stated, 4), round(act, 4),
                         round(abs(act - stated), 4)))

    # 2) overall discrimination
    print("\n2) DISCRIMINATION - does confidence separate accurate legs from inaccurate ones?")
    print(f"   {'tier':<9}{'n':>9}{'stated':>9}{'actual':>9}{'|gap|':>8}")
    gaps = {}
    for tier in ("low", "medium", "high", "elite"):
        s = d[d["conf_tier"] == tier]
        if len(s) < 300:
            continue
        stated, act = float(s["final_hp"].mean()), float(s["won"].mean())
        gaps[tier] = abs(act - stated)
        print(f"   {tier:<9}{len(s):>9,}{stated:>9.4f}{act:>9.4f}{abs(act-stated):>8.4f}", flush=True)
        rows.append(("overall", "all", tier, len(s), round(stated, 4), round(act, 4), round(abs(act - stated), 4)))
    if "elite" in gaps and "low" in gaps:
        verdict = "WORKING" if gaps["elite"] < gaps["low"] else "NOT DISCRIMINATING"
        print(f"\n   elite |gap| {gaps['elite']:.4f} vs low |gap| {gaps['low']:.4f}  ->  {verdict}", flush=True)

    # 3) per component - is each pillar earning its weight?
    print("\n3) PER COMPONENT - does each confidence pillar independently separate?")
    for comp in ("c_exist", "c_quality", "c_market"):
        v = d[comp].astype(float)
        hi = d[v >= v.quantile(0.75)]
        lo = d[v <= v.quantile(0.25)]
        if len(hi) < 300 or len(lo) < 300:
            continue
        ghi = abs(float(hi["won"].mean()) - float(hi["final_hp"].mean()))
        glo = abs(float(lo["won"].mean()) - float(lo["final_hp"].mean()))
        print(f"   {comp:<12} top quartile |gap| {ghi:.4f}   bottom quartile |gap| {glo:.4f}   "
              f"{'separates' if ghi < glo else 'NO SEPARATION - weight is wasted'}", flush=True)
        rows.append(("component", comp, "top_vs_bottom", len(hi), round(ghi, 4), round(glo, 4),
                     round(glo - ghi, 4)))

    # 4) must hold in both seasons and every phase
    print("\n4) HOLDS ACROSS SEASONS AND PHASES? (elite |gap| minus low |gap|; negative = working)")
    for key in ("season", "phase"):
        for k, g in d.groupby(key, observed=True):
            e, l = g[g["conf_tier"] == "elite"], g[g["conf_tier"] == "low"]
            if len(e) < 200 or len(l) < 200:
                continue
            ge = abs(float(e["won"].mean()) - float(e["final_hp"].mean()))
            gl = abs(float(l["won"].mean()) - float(l["final_hp"].mean()))
            print(f"   {key:<8}{str(k):<14}elite {ge:.4f}  low {gl:.4f}  diff {ge-gl:+.4f}", flush=True)
            rows.append((key, str(k), "elite_minus_low", len(e), round(ge, 4), round(gl, 4), round(ge - gl, 4)))

    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.confidence_verification (
            check_type text, slice text, tier text, n int, stated numeric, actual numeric,
            gap numeric, run_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.confidence_verification")
        cur.executemany("""INSERT INTO nba_score.confidence_verification
            (check_type, slice, tier, n, stated, actual, gap) VALUES (%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()
    conn.close()
    print(f"\nwrote {len(rows)} verification rows to nba_score.confidence_verification", flush=True)


if __name__ == "__main__":
    main()
