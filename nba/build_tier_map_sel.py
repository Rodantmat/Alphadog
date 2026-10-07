#!/usr/bin/env python3
"""
SELECTION LEG TABLE - nba_score.tier_map_legs_sel (strategy doc §31s G1 gate 2b; production, P5 weekly).

The certified cell DESIGN (tier map, bands, candidates, certified cells) stays on nba_score.tier_map_legs - half-point legs, as
certified. What a strategy actually PICKS FROM is the live leg pool, which since gate 2b also holds whole-number legs placed in the
cells' own currency (live_slip_engine.whole_number_legs; switch classification_config['whole_number_selection']). The slip engine,
the weekly requalification (P5), validation and the live monitors' references must measure that same pool, so this table is:

    tier_map_legs (copied untouched)  +  whole-number legs priced exactly as the system prices them
      - the two certified seasons (2024-25, 2025-26): CROSS-FITTED (each season priced only with the other season's fits) -
        identical to the gate-2b test table (build_tier_map_wi2 functions, shared code)
      - every other season (live, 2026-27 on): the LIVE path itself - pooled recalibration + tie scale (the formula of the daily
        final_hp_derived 'whole_number' row), live_slip_engine.wn_price (safety discount, tie EV) and wn_score (stored pooled
        currency maps nba_score.wn_currency_map) - the same functions the live pick calls
    n_rank / cell_size recomputed over the union (cells partition by rank_key, date, prop, tier).
Switched off -> the table is an exact copy of tier_map_legs (the engine then builds exactly the certified slips).
Env: DATABASE_URL.
"""
import os
import sys

import numpy as np
import pandas as pd
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_tier_map_wi2 as W  # noqa: E402
import live_slip_engine as L    # noqa: E402

CERTIFIED_SEASONS = ("2024-25", "2025-26")


def live_rows(w, rcfg, sel):
    """whole-number legs of non-certified seasons, priced by the live path"""
    cfg, maps = sel
    a, b = float(rcfg["a"]), float(rcfg["b"])
    pooled_ratio = rcfg.get("tie_scale_method", {}).get("pooled_ratio", 1.0)
    rows, miss = [], 0
    for r_ in w.itertuples(index=False):
        # build_whole_number_hp's formula for the daily row (final_hp rounded 6, p_tie rounded 5)
        pc = round(float(W.sig(a + b * W.logit(np.array([r_.pc0])))[0]), 6)
        pt = round(float(rcfg["tie_scale"].get(r_.prop, pooled_ratio)) * max(0.0, float(r_.raw_tie)), 5)
        p_eq = L.wn_price(cfg, pc, pt)
        for rk in ("final_hp", "baseline_hp", "final_score"):
            s = L.wn_score(maps, rk, r_.prop, r_.tier, r_.side, p_eq)
            if s is None:
                miss += 1; continue
            rows.append((rk, r_.season, r_.game_date, r_.player, r_.prop, r_.side, float(r_.line), r_.kind, r_.tier,
                         None if pd.isna(r_.sys_tier) else int(r_.sys_tier), float(r_.price), s, None if pd.isna(r_.h) else int(r_.h)))
    return rows, miss


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    sel = L.wn_selection(conn)
    rows = []
    if sel is None:
        print("whole-number selection is SWITCHED OFF (or not fitted) - tier_map_legs_sel = tier_map_legs", flush=True)
    else:
        rcfg = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='whole_number_recalibration'").fetchone()[0]
        w = W.load_raw(conn)
        hist = w[w["season"].isin(CERTIFIED_SEASONS)]
        live = W.dedup(w[~w["season"].isin(CERTIFIED_SEASONS)])
        hp = W.crossfit_price(hist, rcfg["per_season_fit"], float(rcfg["tie_scale_method"]["alpha_mle"]))
        r1, m1 = W.crossfit_rows(W.dedup(hp), W.crossfit_maps(conn)) if len(hp) else ([], 0)
        r2, m2 = live_rows(live, rcfg, sel) if len(live) else ([], 0)
        rows = r1 + r2
        print(f"whole-number rows: certified seasons {len(r1):,} (cross-fitted; no map {m1}) | live seasons {len(r2):,} "
              f"(live path; no map {m2})", flush=True)
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS nba_score._sel_new")
        cur.execute("""CREATE TABLE nba_score._sel_new (rank_key text, season text, game_date date, player text, prop text, side text,
                       line numeric, kind text, tier text, rung int, factor double precision, score double precision, hit int)""")
        with cur.copy("COPY nba_score._sel_new FROM STDIN") as cp:
            for t in rows:
                cp.write_row(t)
        cur.execute("DROP TABLE IF EXISTS nba_score.tier_map_legs_sel_build")
        cur.execute("""CREATE TABLE nba_score.tier_map_legs_sel_build AS
            WITH u AS (SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score.tier_map_legs
                       UNION ALL SELECT rank_key, season, game_date, player, prop, side, line, kind, tier, rung, factor, score, hit FROM nba_score._sel_new)
            SELECT u.*, row_number() OVER (PARTITION BY rank_key, game_date, prop, tier ORDER BY score DESC)::int AS n_rank,
                   count(*) OVER (PARTITION BY rank_key, game_date, prop, tier)::int AS cell_size FROM u""")
        cur.execute("CREATE INDEX ON nba_score.tier_map_legs_sel_build (rank_key, game_date, prop, tier)")
        cur.execute("DROP TABLE nba_score._sel_new")
        # swap in one transaction: readers never see a half-built table
        cur.execute("DROP TABLE IF EXISTS nba_score.tier_map_legs_sel")
        cur.execute("ALTER TABLE nba_score.tier_map_legs_sel_build RENAME TO tier_map_legs_sel")
    conn.commit()
    chk = conn.execute("""SELECT count(*) FROM nba_score.tier_map_legs c JOIN nba_score.tier_map_legs_sel s USING (rank_key, game_date, player, prop, side, line)
                          WHERE c.score IS DISTINCT FROM s.score OR c.hit IS DISTINCT FROM s.hit OR c.factor IS DISTINCT FROM s.factor""").fetchone()[0]
    tot = conn.execute("SELECT (SELECT count(*) FROM nba_score.tier_map_legs), (SELECT count(*) FROM nba_score.tier_map_legs_sel)").fetchone()
    print(f"tier_map_legs {tot[0]:,} | tier_map_legs_sel {tot[1]:,} (+{tot[1] - tot[0]:,}) | certified legs altered (must be 0): {chk}", flush=True)
    if chk:
        raise SystemExit("FAIL: certified legs altered in the selection table")
    conn.close()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
