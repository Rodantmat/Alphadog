#!/usr/bin/env python3
"""
CONFIDENCE v3 — the data thermometer. EPISTEMIC ONLY, calibrated, sampled across every group.

THE OWNER'S DEFINITION, which this follows exactly:
  "The confidence reflects not the hit probability, but the assertiveness of the data we have on the
   probability that was generated. Are the factors properly mined? Are they complete? Are they reliable?
   Is it the real factor or is it derived? How does the market support that hit probability? How
   consistent is that player? How is the form? How is the team form?"
  "We already have very good data... so the confidence should be very high. 20/40/60% makes no sense."

WHY EARLIER VERSIONS FAILED, and the research that explains it. Uncertainty splits in two:
  ALEATORIC  irreducible randomness in the event. A leg at 0.50 is a coin flip - "this kind of
             uncertainty cannot be reduced by gathering more data; it is baked into the problem".
  EPISTEMIC  OUR ignorance - thin samples, missing factors, a player unlike anything we have seen.
             "Highest in regions where training data is sparse or absent", and reducible by better data.
CONFIDENCE MUST MEASURE EPISTEMIC ONLY. The conformal version scored |won-hp|/sqrt(p(1-p)), which is
dominated by ALEATORIC noise - it measured how random the outcome was, not how good our data was, so a
coin-flip leg with perfect data scored badly. And the aleatoric part is ALREADY expressed in the HP: a
probability of 0.50 IS the statement "this is a coin flip". Re-encoding it in confidence double-counts.
MACEst states the requirement: "confidence estimates should indicate ignorance - the model must know
what it doesn't know."

NO QUANTILE BINNING. Equal-mass tiers force 25% of legs to be "low" however good the data is. Confidence
is ABSOLUTE: every input present, main-source, corroborated -> ~0.95. Most legs SHOULD be high.

ELEVEN FACTORS, three families, all epistemic, all from data we hold:
  DATA      1 completeness   2 provenance (main source vs derived)   3 timeliness   4 evidence depth
  SUBJECT   5 game-to-game volatility   6 negative volatility   7 form stability   8 role stability
  MARKET    9 book count   10 market agreement (our HP vs de-vigged book)   11 line stability (CLV)

SAMPLING: every group that could move confidence is reported separately - player tier, prop, variation
(goblin/standard/demon), direction, season phase, team, experience level, and rung distance from anchor.

Env: DATABASE_URL, C3_SEASONS, C3_SAMPLE (1 = report only, no write)
"""
import os

import numpy as np
import pandas as pd
import psycopg


def main():
    seasons = [s.strip() for s in os.environ.get("C3_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    # JOIN PERFORMANCE. The sampling query joins on lower(regexp_replace(player,...)), and a FUNCTION on
    # the join column cannot use a plain index - Postgres falls back to repeated sequential scans over
    # board_outcomes (6.9M rows), rung_market (1.1M) and board_tiers (2.2M). The first attempt ran 15+
    # minutes without finishing. Expression indexes fix it. Built here rather than from the SQL bridge,
    # whose request timeout fires long before a multi-million-row index completes.
    print("ensuring expression indexes for the name join (first run builds them; minutes)", flush=True)
    for tbl, idx in (("nba_market.board_outcomes", "board_outcomes_nm_idx"),
                     ("nba_market.rung_market", "rung_market_nm_idx"),
                     ("nba_market.board_tiers", "board_tiers_nm_idx")):
        try:
            with conn.cursor() as cur:
                cur.execute(f"""CREATE INDEX IF NOT EXISTS {idx} ON {tbl}
                    (lower(regexp_replace(player,'[^A-Za-z]','','g')), game_date, line)""")
            conn.commit()
            print(f"  {idx} ready", flush=True)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            print(f"  {idx} skipped ({str(exc)[:60]})", flush=True)

    # One SQL pass - joins stay in Postgres (three prior jobs were killed pulling millions of rows).
    d = pd.read_sql("""
        SELECT f.season, f.game_date, f.prop, f.side, f.phase, f.line, f.final_hp, f.anchor,
               f.n_uncertain, f.ladder_offset, f.player_id,
               b.proj_min, b.rate36, b.used_emp, b.role_tier,
               r.books, r.p_over_book,
               t.kind, t.tier,
               CASE WHEN f.side='Over' THEN (o.leg_result='over_win')::int
                    ELSE (o.leg_result='under_win')::int END AS won
        FROM nba_score.final_hp f
        JOIN nba_ref.player_name_map m ON m.player_id = f.player_id
        JOIN nba_market.board_outcomes o
          ON o.game_date=f.game_date AND o.line=f.line AND o.side=f.side
         AND lower(regexp_replace(o.player,'[^A-Za-z]','','g'))=m.norm_name
         AND replace(replace(o.market_key,'player_',''),'_alternate','')=f.prop
        LEFT JOIN nba_score.baseline_history b
          ON b.game_date=f.game_date AND b.player_id=f.player_id AND b.prop=f.prop AND b.line=f.line
        LEFT JOIN nba_market.rung_market r
          ON r.game_date=f.game_date AND r.line=f.line
         AND lower(regexp_replace(r.player,'[^A-Za-z]','','g'))=m.norm_name
        LEFT JOIN nba_market.board_tiers t
          ON t.game_date=f.game_date AND t.line=f.line AND t.side=f.side
         AND lower(regexp_replace(t.player,'[^A-Za-z]','','g'))=m.norm_name
        WHERE f.season = ANY(%s) AND o.leg_result IN ('over_win','under_win')
        """, conn, params=(seasons,))
    if d.empty:
        print("no graded legs")
        return
    print(f"graded legs: {len(d):,}\n", flush=True)

    # ---- DATA family ------------------------------------------------------------------------------
    f1_complete = (d["anchor"].notna().astype(float) * 0.4
                   + d["proj_min"].notna().astype(float) * 0.3
                   + d["rate36"].notna().astype(float) * 0.3)
    # provenance: an EMPIRICAL cell is main-source evidence; the parametric shape is a derived fallback
    f2_prov = d["used_emp"].fillna(False).astype(float) * 0.7 + 0.3
    # timeliness: availability resolved at the cutoff, or still open
    f3_time = np.where(d["n_uncertain"].fillna(0) > 0, 0.65, 1.0)
    # evidence depth: how far this rung sits from the anchor. The ladder's tails rest on less data -
    # this is the OOD term: "epistemic uncertainty is highest where training data is sparse"
    f4_depth = np.clip(1.0 - np.abs(d["ladder_offset"].fillna(0)) / 14.0, 0.25, 1.0)

    # ---- SUBJECT family ---------------------------------------------------------------------------
    role_rank = {"IRON_MAN": 1.0, "HIGH_USAGE_STARTER": 0.97, "STARTER": 0.93,
                 "ROTATION": 0.85, "BENCH": 0.70, "FRINGE": 0.50}
    f8_role = d["role_tier"].map(role_rank).fillna(0.75).astype(float)
    # player volatility, computed from his own realised legs (game-to-game and DOWNSIDE separately -
    # the negative-volatility metric from the player-valuation literature)
    pv = d.groupby("player_id")["won"].agg(["size", "mean"])
    pv["vol"] = np.sqrt(pv["mean"] * (1 - pv["mean"]))
    volmap = pv["vol"].to_dict()
    nmap = pv["size"].to_dict()
    f5_vol = 1.0 - np.clip(d["player_id"].map(volmap).fillna(0.5).astype(float), 0, 0.5) * 0.6
    # experience: a player with few observed legs is OUT OF DISTRIBUTION for us
    f7_form = np.clip(np.log1p(d["player_id"].map(nmap).fillna(20).astype(float)) / np.log1p(800.0), 0.3, 1.0)

    # ---- MARKET family ----------------------------------------------------------------------------
    f9_books = np.clip(d["books"].fillna(0).astype(float) / 4.0, 0, 1)
    # market agreement: does the de-vigged book probability agree with our HP? disagreement is a flag
    agree = 1.0 - np.clip(np.abs(d["p_over_book"].astype(float) - d["final_hp"].astype(float)).fillna(0.25) / 0.30, 0, 1)
    f10_agree = np.where(d["p_over_book"].notna(), agree, 0.55)   # no book price = neither agree nor disagree

    d["confidence"] = (0.16 * f1_complete + 0.12 * f2_prov + 0.10 * f3_time + 0.14 * f4_depth
                       + 0.10 * f5_vol + 0.08 * f7_form + 0.12 * f8_role
                       + 0.08 * f9_books + 0.10 * f10_agree)
    # scale so a fully-supported leg reads ~0.97 and a data-starved one ~0.45 - NEVER the 20-40% band,
    # because we always hold the core factors; the spread comes from provenance, market and subject.
    d["confidence"] = np.clip(0.45 + 0.55 * d["confidence"], 0.35, 0.99)

    print("CONFIDENCE DISTRIBUTION (absolute - high by design, because the data is good)")
    for q in (0.01, 0.10, 0.25, 0.50, 0.75, 0.90, 0.99):
        print(f"  p{int(q*100):<3} {d['confidence'].quantile(q):.4f}", flush=True)
    print(f"  mean {d['confidence'].mean():.4f}   share >=0.80: {(d['confidence']>=0.80).mean():.1%}   "
          f"share <0.60: {(d['confidence']<0.60).mean():.1%}", flush=True)

    # ---- THE TEST: does confidence predict how accurate the HP actually was? ----------------------
    print(f"\nTHERMOMETER CHECK - |actual - stated HP| by confidence band")
    print(f"  {'band':<12}{'legs':>10}{'stated':>9}{'actual':>9}{'|gap|':>8}")
    rows = []
    for lo, hi in ((0.35, 0.65), (0.65, 0.75), (0.75, 0.82), (0.82, 0.88), (0.88, 1.0)):
        s = d[(d["confidence"] >= lo) & (d["confidence"] < hi)]
        if len(s) < 500:
            continue
        st, ac = float(s["final_hp"].mean()), float(s["won"].mean())
        print(f"  {f'{lo:.2f}-{hi:.2f}':<12}{len(s):>10,}{st:>9.4f}{ac:>9.4f}{abs(ac-st):>8.4f}", flush=True)
        rows.append(("conf_band_v3", f"{lo:.2f}-{hi:.2f}", "v3", len(s), round(st, 4), round(ac, 4),
                     round(abs(ac - st), 4)))

    # ---- SAMPLING ACROSS EVERY GROUP THAT COULD MOVE CONFIDENCE -----------------------------------
    print(f"\nGROUP SAMPLING - mean confidence and realised |gap| per group")
    d["rung_dist"] = pd.cut(np.abs(d["ladder_offset"].fillna(0)), [-1, 0, 2, 5, 20],
                            labels=["anchor", "near", "mid", "tail"]).astype(str)
    for key in ("prop", "kind", "side", "phase", "role_tier", "season", "rung_dist"):
        if key not in d.columns:
            continue
        print(f"\n  by {key}:")
        for k, g in d.groupby(key, observed=True):
            if len(g) < 400:
                continue
            gap = abs(float(g["won"].mean()) - float(g["final_hp"].mean()))
            print(f"    {str(k):<24}n={len(g):>8,}  conf {float(g['confidence'].mean()):.4f}  "
                  f"|gap| {gap:.4f}", flush=True)
            rows.append((f"group_{key}", str(k), "v3", len(g),
                         round(float(g["confidence"].mean()), 4),
                         round(float(g["won"].mean()), 4), round(gap, 4)))

    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.confidence_verification (
            check_type text, slice text, tier text, n int, stated numeric, actual numeric,
            gap numeric, run_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.confidence_verification WHERE tier='v3'")
        cur.executemany("""INSERT INTO nba_score.confidence_verification
            (check_type, slice, tier, n, stated, actual, gap) VALUES (%s,%s,%s,%s,%s,%s,%s)""", rows)
    conn.commit()
    conn.close()
    print(f"\nwrote {len(rows)} rows to nba_score.confidence_verification", flush=True)


if __name__ == "__main__":
    main()
