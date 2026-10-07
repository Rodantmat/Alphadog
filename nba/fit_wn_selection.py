#!/usr/bin/env python3
"""
WHOLE-NUMBER LEGS IN LIVE SELECTION - the stored fit (strategy doc §31s G1 gate 2b; owner 2026-10-06: "if whole-number lines are
on the board and properly priced they can and should make slips if they are strong").

Gate 2b (nba/build_tier_map_wi2.py, cross-fitted, both seasons): the price p_eq = (pc - SE)*(1 - pt) + 0.5*pt is honest out of
sample, and whole-number legs placed in the cells' own currency were used in 16.4% / 7.8% of slips with the portfolio unchanged
(77.8 -> 78.1%, 94.0 -> 93.9%; profit +12 / +1). This script stores what the LIVE engine needs, fitted on BOTH seasons (pooled, as
every live fit here is):
  nba_score.wn_currency_map   per (rank_key, prop, tier, side|'*'): the isotonic blocks of raw half-point score -> realized hit
                              rate on the certified tier map (block value, lowest and highest raw score in the block)
  classification_config['whole_number_selection']: enabled switch, R (tie worth), bin width, the SE table of the pooled
                              recalibrated price (realized rate and n per 0.05 bin, non-tied legs), MIN_N, evidence
The live engine (live_slip_engine.load_board_legs_live) reads both; the price itself (recalibrated pc, p_tie) is the daily
nba_score.final_hp_derived 'whole_number' row. Env: DATABASE_URL, WS_WRITE=1 to write (otherwise prints only).
"""
import json
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tier_map_wi import STEPS as WI_STEPS  # noqa: E402
from build_tier_map_wi2 import RAW_SQL, BIN, MIN_N, R_TIE, logit, pav, sig  # noqa: E402

EVIDENCE = ("gate 2b 2026-10-06 (cross-fitted): p_eq honest out of sample (0.568 -> 0.570 / 0.567 -> 0.559; 0.610 -> 0.599 / "
            "0.608 -> 0.602); slips using a whole-number leg 16.4% (2024-25) / 7.8% (2025-26); portfolio 77.8 -> 78.1% / "
            "94.0 -> 93.9%, profit +2,374 -> +2,386 / +2,948 -> +2,949, max drawdown 137 -> 158 / 86 -> 80 (strategy §31s)")


def blocks(fx, fy):
    """collapse the PAV step function into blocks: (value, lowest raw score, highest raw score)"""
    out = []
    i = 0
    while i < len(fx):
        j = i
        while j + 1 < len(fx) and fy[j + 1] == fy[i]:
            j += 1
        out.append((float(fy[i]), float(fx[i]), float(fx[j])))
        i = j + 1
    return out


def main():
    write = os.environ.get("WS_WRITE") == "1"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    cfg = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='whole_number_recalibration'").fetchone()[0]
    a, b = float(cfg["a"]), float(cfg["b"])
    # SE table of the POOLED recalibrated price (non-tied legs, both seasons)
    for label, sql in WI_STEPS:
        if label == "priced whole-number window legs":
            conn.execute(sql)
            break
    conn.execute("CREATE INDEX ON _pi (game_date, nm, prop, side, line)")
    w = pd.read_sql(RAW_SQL, conn)
    w["hit"] = w["hit"].astype(float)
    w = w[w["hit"].notna() & ((w["o_f"] + w["u_f"]) > 0)].copy()
    w["pc"] = sig(a + b * logit(np.where(w["side"].eq("Over"), w["o_f"], w["u_f"]) / (w["o_f"] + w["u_f"])))
    w["bin"] = np.floor(w["pc"] / BIN).astype(int)
    se = {str(int(k)): [round(float(g["hit"].mean()), 5), int(len(g))] for k, g in w.groupby("bin")}
    print(f"SE table (pooled, non-tied whole-number legs {len(w):,}): {se}", flush=True)
    # currency maps on the certified half-point legs, both seasons pooled
    cert = pd.read_sql("""SELECT rank_key, prop, tier, side, score, hit FROM nba_score.tier_map_legs
                          WHERE hit IS NOT NULL AND line <> floor(line)""", conn)
    rows = []
    for keys, cols in ((["rank_key", "prop", "tier", "side"], None), (["rank_key", "prop", "tier"], "*")):
        for k, g in cert.groupby(keys):
            if len(g) < MIN_N:
                continue
            rk, prop, tier = k[0], k[1], k[2]
            side = k[3] if cols is None else "*"
            fx, fy = pav(g["score"].values, g["hit"].values.astype(float), np.ones(len(g)))
            for i, (v, lo, hi) in enumerate(blocks(fx, fy)):
                rows.append((rk, prop, tier, side, i, v, lo, hi, len(g)))
    print(f"currency map: {len(rows):,} blocks over {len({r[:4] for r in rows}):,} groups", flush=True)
    if not write:
        print("DRY RUN - nothing written", flush=True)
        return
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.wn_currency_map (rank_key text, prop text, tier text, side text, block int,
                       hit_rate double precision, score_lo double precision, score_hi double precision, n int,
                       built_at timestamptz DEFAULT now(), PRIMARY KEY (rank_key, prop, tier, side, block))""")
        cur.execute("DELETE FROM nba_score.wn_currency_map")
        with cur.copy("COPY nba_score.wn_currency_map (rank_key, prop, tier, side, block, hit_rate, score_lo, score_hi, n) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
        prev = cur.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='whole_number_selection'").fetchone()
        enabled = bool(prev[0].get("enabled", True)) if prev else True     # keep an owner's switch if already set
        doc = {"enabled": enabled, "r_tie": R_TIE, "bin": BIN, "min_n": MIN_N, "se_bins": se,
               "formula": "p_eq = clip(pc - sqrt(r(1-r)/n)[bin of pc], 0, 1) * (1 - p_tie) + r_tie * p_tie; score = lowest raw score "
                          "of the first currency-map block whose hit_rate >= p_eq (rank_key, prop, tier, side; else side '*'); "
                          "above the map -> its top score",
               "price_source": "nba_score.final_hp_derived derivation 'whole_number' (final_hp = recalibrated P(win | no tie), p_tie)",
               "maps_table": "nba_score.wn_currency_map", "evidence": EVIDENCE, "fitted_at": str(pd.Timestamp.today().date())}
        cur.execute("""INSERT INTO nba_config.classification_config (config_key, config_json) VALUES ('whole_number_selection', %s)
                       ON CONFLICT (config_key) DO UPDATE SET config_json = EXCLUDED.config_json""", (json.dumps(doc),))
    conn.commit()
    print(f"WRITTEN: nba_score.wn_currency_map {len(rows):,} blocks; config whole_number_selection (enabled={enabled})", flush=True)


if __name__ == "__main__":
    main()
