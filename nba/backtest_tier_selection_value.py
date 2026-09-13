#!/usr/bin/env python3
"""
SELECTION VALUE PER TIER — does model selection change the goblin/demon EV verdict?

THE QUESTION. The tier study (config prizepicks_goblin_demon_tier_spec) measured AVERAGE hit rates per
tier and concluded goblins are -EV at every tier: they hit 74.1 / 68.7 / 61.9% at T-3/-2/-1, which only
affords giving up 34 / 29 / 21% of payout, while observed goblin factors take 40-53%. That verdict is
about the AVERAGE goblin.

But we do not have to take the average goblin. The edge backtest shows that on model-selected alternates
(model p >= 66%) the actual hit rate is 72.7% against a claimed 75.8% - so selection is doing real work.
If selection lifts a tier's hit rate materially above its average, the EV verdict for that tier changes.

WHAT THIS MEASURES, per tier, both seasons, graded legs only:
    n_all, hit_all          every leg at that tier
    n_sel, hit_sel          legs the model ranks at p >= threshold
    lift                    hit_sel - hit_all        <- the value of selection
    afford                  1 - breakeven/hit_sel    <- payout we can give up and still break even
and compares `afford` to the observed goblin payout haircut (40-53%) and the demon requirement.

A tier is worth playing only if the SELECTED hit rate affords the payout the app actually offers.

Env: DATABASE_URL, SV_THRESHOLD (default 0.66), SV_BREAKEVEN (default 0.56)
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


def fetch(name, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        return json.load(r)


def main():
    thr = float(os.environ.get("SV_THRESHOLD", "0.66"))
    be = float(os.environ.get("SV_BREAKEVEN", "0.56"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    pid_map = {norm_name(x.get("DISPLAY_FIRST_LAST")): str(x.get("PERSON_ID"))
               for x in fetch("nba_all_players.json").get("records") or []}

    hist = []
    for season in ("2024-25", "2025-26"):
        h = pd.read_sql("""SELECT game_date, player_id, line, p_more, p_less
                           FROM nba_score.baseline_history WHERE season=%s AND prop='points'""",
                        conn, params=(season,))
        if not h.empty:
            h["game_date"] = pd.to_datetime(h["game_date"]).dt.date
            h["player_id"] = h["player_id"].astype(str)
            h["line"] = h["line"].astype(float)
            hist.append(h.drop_duplicates(subset=["game_date", "player_id", "line"]))
    hist = pd.concat(hist, ignore_index=True)

    tiers = pd.read_sql("""SELECT game_date, player, base_market, line, side, tier, kind
                           FROM nba_market.board_tiers
                           WHERE snapshot_label='window' AND base_market='player_points'""", conn)
    tiers["game_date"] = pd.to_datetime(tiers["game_date"]).dt.date
    tiers["line"] = tiers["line"].astype(float)
    tiers["player_id"] = tiers["player"].map(norm_name).map(pid_map)
    tiers = tiers[tiers["player_id"].notna()].drop_duplicates(
        subset=["game_date", "player_id", "line", "side"])

    out = pd.read_sql("""SELECT game_date, player, line, side, leg_result
                         FROM nba_market.board_outcomes
                         WHERE replace(market_key,'_alternate','')='player_points'""", conn)
    conn.close()
    out["game_date"] = pd.to_datetime(out["game_date"]).dt.date
    out["line"] = out["line"].astype(float)
    out["player_id"] = out["player"].map(norm_name).map(pid_map)
    out = out[out["player_id"].notna()].drop_duplicates(subset=["game_date", "player_id", "line", "side"])

    d = tiers.merge(hist, on=["game_date", "player_id", "line"], how="inner") \
             .merge(out[["game_date", "player_id", "line", "side", "leg_result"]],
                    on=["game_date", "player_id", "line", "side"], how="inner")
    d = d[d["leg_result"].isin(["over_win", "under_win"])]
    d["p_model"] = np.where(d["side"] == "Over", d["p_more"], d["p_less"]).astype(float)
    d["won"] = np.where(d["side"] == "Over", d["leg_result"] == "over_win",
                        d["leg_result"] == "under_win").astype(int)

    # SEASON PHASE. A full-season average hides three different regimes:
    #   EARLY  - rotations unsettled, small samples, the model's priors dominate
    #   MID    - the stable core of the season
    #   LATE   - rest management and tanking; stars lose minutes for reasons no box score predicts
    # The correction must be phase-conditional, and the phase pattern is what transfers to a NEW season
    # (the model cannot know 2026-27 rotations, but it can know that October behaves like October).
    gnum = (d.sort_values("game_date")
              .groupby(["player_id", d["game_date"].map(lambda x: x.year if x.month >= 10 else x.year - 1)])
              .cumcount() + 1)
    d["team_game_no"] = gnum.reindex(d.index)
    d["phase"] = pd.cut(d["team_game_no"], [0, 15, 60, 200], labels=["early", "mid", "late"])
    print(f"graded tiered legs: {len(d):,}  — FULL GRID, no selection\n", flush=True)
    print("Every leg on the board has a final HP from the ladder (anchor +/-10, both directions, all", flush=True)
    print("tiers). This grid reports the MEASURED hit rate for each cell so ROI can be read per band -", flush=True)
    print("it does not pick legs. Selection belongs to the slip engine, pricing belongs here.\n", flush=True)

    # first: does phase matter at all? if the gap is the same in every phase, one correction serves.
    print("PHASE CHECK - is the calibration gap regime-dependent?")
    print(f"  {'phase':<8}{'n':>9}{'model':>9}{'ACTUAL':>9}{'gap':>9}")
    for ph, g in d.groupby("phase", observed=True):
        if len(g) < 500:
            continue
        print(f"  {str(ph):<8}{len(g):>9,}{g['p_model'].mean():>9.4f}{g['won'].mean():>9.4f}"
              f"{g['won'].mean()-g['p_model'].mean():>+9.4f}", flush=True)
    print("", flush=True)

    d["band"] = pd.cut(d["p_model"], [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0])
    print(f"{'kind':<9}{'tier':>5}{'phase':<7}{'band':<14}{'n':>7}{'model':>8}{'ACTUAL':>8}{'gap':>8}")
    rows = []
    for (kind, tier, phase, band), g in d.groupby(["kind", "tier", "phase", "band"], observed=True):
        if len(g) < 200:
            continue
        mp, act = float(g["p_model"].mean()), float(g["won"].mean())
        print(f"{kind:<9}{tier:>5}{str(phase):<7}{str(band):<14}{len(g):>7,}{mp:>8.4f}{act:>8.4f}"
              f"{act-mp:>+8.4f}", flush=True)
        rows.append((kind, int(tier), str(phase), str(band), len(g), round(mp, 4), round(act, 4),
                     round(act - mp, 4), round(act - be, 4)))

    if rows:
        conn2 = psycopg.connect(os.environ["DATABASE_URL"])
        with conn2.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS nba_score.tier_band_calibration")
            cur.execute("""CREATE TABLE nba_score.tier_band_calibration (
                kind text, tier int, phase text, band text, n int, model_p numeric, actual numeric,
                gap numeric, clears_breakeven numeric, breakeven numeric, run_at timestamptz DEFAULT now())""")
            cur.executemany("""INSERT INTO nba_score.tier_band_calibration
                (kind, tier, phase, band, n, model_p, actual, gap, clears_breakeven, breakeven)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", [r + (be,) for r in rows])
        conn2.commit()
        conn2.close()
        print(f"\nwrote {len(rows)} cells to nba_score.tier_band_calibration", flush=True)


if __name__ == "__main__":
    main()
