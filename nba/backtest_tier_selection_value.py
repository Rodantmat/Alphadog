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
    print(f"graded tiered legs: {len(d):,} | threshold p>={thr:.2f} | break-even {be:.3f}\n", flush=True)

    print(f"{'kind':<10}{'tier':>5}{'n_all':>9}{'hit_all':>9}{'n_sel':>8}{'hit_sel':>9}"
          f"{'lift':>8}{'afford':>9}   verdict")
    rows = []
    for (kind, tier), g in d.groupby(["kind", "tier"]):
        if len(g) < 500:
            continue
        sel = g[g["p_model"] >= thr]
        if len(sel) < 200:
            continue
        hit_all, hit_sel = g["won"].mean(), sel["won"].mean()
        afford = 1 - be / hit_sel if hit_sel > 0 else -1
        # goblins: observed factors take 40-53% of payout. demons: need the payout to cover the odds.
        if kind == "goblin":
            ok = afford >= 0.40
            verdict = "PLAYABLE if the haircut is <= %.0f%%" % (afford * 100) if ok else "still -EV (affords %.0f%%, app takes 40-53%%)" % (afford * 100)
        else:
            need = be / hit_sel if hit_sel > 0 else 99
            ok = need <= 1.75
            verdict = "needs %.2fx (ceiling ~1.75-1.9x) %s" % (need, "OK" if ok else "TOO HIGH")
        print(f"{kind:<10}{tier:>5}{len(g):>9,}{hit_all:>9.4f}{len(sel):>8,}{hit_sel:>9.4f}"
              f"{hit_sel-hit_all:>+8.4f}{afford:>9.3f}   {verdict}", flush=True)
        rows.append((kind, int(tier), len(g), round(float(hit_all), 4), len(sel),
                     round(float(hit_sel), 4), round(float(hit_sel - hit_all), 4), round(float(afford), 4)))

    if rows:
        conn2 = psycopg.connect(os.environ["DATABASE_URL"])
        with conn2.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.tier_selection_value (
                kind text, tier int, n_all int, hit_all numeric, n_sel int, hit_sel numeric,
                lift numeric, afford numeric, threshold numeric, breakeven numeric,
                run_at timestamptz DEFAULT now())""")
            cur.executemany("""INSERT INTO nba_score.tier_selection_value
                (kind, tier, n_all, hit_all, n_sel, hit_sel, lift, afford, threshold, breakeven)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [r + (thr, be) for r in rows])
        conn2.commit()
        conn2.close()
        print(f"\nwrote {len(rows)} tier rows to nba_score.tier_selection_value", flush=True)


if __name__ == "__main__":
    main()
