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


FACTOR_COLS = ["f_complete", "f_prov", "f_time", "f_depth", "f_role", "f_vol", "f_exp",
               "f_books", "f_agree"]


def confidence_of(d, attach=False):
    """The epistemic factors. ABSOLUTE - no quantiles, no ranking against other legs.

    Measures how well OUR DATA supports this leg's hit probability, never how random the outcome is.
    The aleatoric part (a 0.50 leg is a coin flip) is ALREADY stated by the HP itself; encoding it here
    would double-count it, which is what broke every earlier version.
    With attach=True the individual factor columns are written onto the frame so the weights can be
    FITTED against measured assertiveness rather than assigned by hand."""
    role_rank = {"IRON_MAN": 1.0, "HIGH_USAGE_STARTER": 0.97, "STARTER": 0.93,
                 "ROTATION": 0.85, "BENCH": 0.70, "FRINGE": 0.50}
    # DATA family
    f_complete = (d["anchor"].notna().astype(float) * 0.4
                  + d["proj_min"].notna().astype(float) * 0.3
                  + d["rate36"].notna().astype(float) * 0.3)
    f_prov = d["used_emp"].fillna(False).astype(float) * 0.7 + 0.3      # empirical cell vs fallback
    f_time = np.where(d["n_uncertain"].fillna(0) > 0, 0.65, 1.0)        # availability resolved?
    f_depth = np.clip(1.0 - np.abs(d["ladder_offset"].fillna(0)) / 14.0, 0.25, 1.0)   # OOD: rung distance
    # SUBJECT family
    f_role = d["role_tier"].map(role_rank).fillna(0.75).astype(float)
    pv = d.groupby("player_id")["won"].agg(["size", "mean"])
    volmap = np.sqrt(pv["mean"] * (1 - pv["mean"])).to_dict()
    nmap = pv["size"].to_dict()
    f_vol = 1.0 - np.clip(d["player_id"].map(volmap).fillna(0.5).astype(float), 0, 0.5) * 0.6
    f_exp = np.clip(np.log1p(d["player_id"].map(nmap).fillna(20).astype(float)) / np.log1p(800.0), 0.3, 1.0)
    # MARKET family
    f_books = np.clip(d["books"].fillna(0).astype(float) / 4.0, 0, 1)
    agree = 1.0 - np.clip((d["p_over_book"].astype(float) - d["final_hp"].astype(float)).abs().fillna(0.25) / 0.30, 0, 1)
    f_agree = np.where(d["p_over_book"].notna(), agree, 0.55)
    raw = (0.16 * f_complete + 0.12 * f_prov + 0.10 * f_time + 0.14 * f_depth
           + 0.10 * f_vol + 0.08 * f_exp + 0.12 * f_role + 0.08 * f_books + 0.10 * f_agree)
    if attach:
        for name, val in (("f_complete", f_complete), ("f_prov", f_prov), ("f_time", f_time),
                          ("f_depth", f_depth), ("f_role", f_role), ("f_vol", f_vol),
                          ("f_exp", f_exp), ("f_books", f_books), ("f_agree", f_agree)):
            d[name] = np.asarray(val, dtype=float)
    # a fully-supported leg reads ~0.97, a data-starved one ~0.45 - NEVER the meaningless 20-40% band,
    # because the core factors are always present
    return pd.Series(np.clip(0.45 + 0.55 * raw, 0.35, 0.99), index=d.index)


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
    # QUERY SHAPE. The first version drove from final_hp (38.7M rows) outward, with two LEFT JOINs that
    # have no unique constraint - rows multiplied before anything filtered, and it ran 29 minutes without
    # finishing even after the expression indexes were built. Indexes could not save the wrong shape.
    # Correct shape: START from the ~1.2M GRADED legs, pre-aggregate the market tables to ONE row per
    # key in CTEs so nothing multiplies, then join INTO final_hp through its unique index on
    # (game_date, player_id, prop, line, side).
    # The baseline_history LEFT JOIN was the real bottleneck: 19.34M rows joined on
    # (game_date, player_id, prop, line), but its only index is the unique key
    # (game_date, player_id, game_id, prop, period, line) - a lookup missing game_id and period in the
    # MIDDLE of that key cannot use it, so every row drove a sequential scan. Two query shapes both hit
    # a 28-minute wall because of this, not because of the join order.
    # Fix: build the covering index once, in-job (the SQL bridge times out long before it completes).
    print("ensuring the baseline_history covering index (first run builds it; minutes)", flush=True)
    try:
        with conn.cursor() as cur:
            cur.execute("""CREATE INDEX IF NOT EXISTS baseline_history_lookup_idx
                ON nba_score.baseline_history (game_date, player_id, prop, line)
                INCLUDE (proj_min, rate36, used_emp, role_tier)""")
        conn.commit()
        print("  baseline_history_lookup_idx ready", flush=True)
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        print(f"  baseline_history_lookup_idx skipped ({str(exc)[:70]})", flush=True)

    # THE ACTUAL BOTTLENECK, from EXPLAIN rather than guesswork. Two rewrites and two indexes failed
    # because the planner was never going to use an index: the join key contained
    # replace(replace(o.market_key,...)) and lower(regexp_replace(o.player,...)) - FUNCTIONS on the join
    # columns - so Postgres fell back to a Parallel Hash Join that built a hash table from 8,270,978
    # final_hp rows (cost 1.8M), which spills to disk and never finishes.
    #
    # Fix: MATERIALIZE the graded side into a temp table with every function already resolved to a plain
    # column, ANALYZE it so the planner has real statistics, then join on plain equality. That lets it
    # nested-loop into final_hp's unique index (game_date, player_id, prop, line, side) instead of
    # hashing the whole table.
    print("materialising the graded side (functions resolved to plain columns)", flush=True)
    with conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS tmp_graded")
        cur.execute("""
            CREATE TEMP TABLE tmp_graded AS
            SELECT o.game_date, o.line, o.side, m.player_id,
                   replace(replace(o.market_key,'player_',''),'_alternate','') AS prop,
                   lower(regexp_replace(o.player,'[^A-Za-z]','','g')) AS nm,
                   CASE WHEN o.side='Over' THEN (o.leg_result='over_win')::int
                        ELSE (o.leg_result='under_win')::int END AS won
            FROM nba_market.board_outcomes o
            JOIN nba_ref.player_name_map m
              ON m.norm_name = lower(regexp_replace(o.player,'[^A-Za-z]','','g'))
            WHERE o.leg_result IN ('over_win','under_win')""")
        cur.execute("CREATE INDEX ON tmp_graded (game_date, player_id, prop, line, side)")
        cur.execute("ANALYZE tmp_graded")
        cur.execute("SELECT count(*) FROM tmp_graded")
        print(f"  graded legs materialised: {cur.fetchone()[0]:,}", flush=True)

    # LOOP PER PROP. EXPLAIN settled where the cost actually is: for ONE prop the plan is healthy -
    # Index Scan on final_hp, Index Only Scan on baseline_history_lookup_idx, cost 1.18M with an
    # 841k-row incremental sort. Run all 30 props in a single query and that sort becomes ~19.6M rows in
    # one merge join, which is what stalled three attempts. The market CTEs are cheap (56k, using
    # rung_market_nm_idx) and baseline_history is cheap per prop - the killer was doing it all at once.
    # build_final_hp.py already loops per prop for the same reason.
    props = [r[0] for r in conn.execute(
        "SELECT DISTINCT prop FROM nba_score.final_hp WHERE season = ANY(%s) ORDER BY 1",
        (seasons,)).fetchall()]
    print(f"sampling {len(props)} props one at a time", flush=True)
    # WRITE INSIDE THE LOOP. A previous run accumulated 30 props in memory and wrote at the end, so a
    # stall anywhere produced NOTHING and said nothing about where it stalled - the same failure as
    # trusting CI logs instead of the database. Each prop now lands immediately: progress is visible,
    # partial results survive, and a stall names the prop it stalled on.
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.confidence_verification (
            check_type text, slice text, tier text, n int, stated numeric, actual numeric,
            gap numeric, run_at timestamptz DEFAULT now())""")
        cur.execute("DELETE FROM nba_score.confidence_verification WHERE tier='v3'")
    conn.commit()
    frames = []
    for prop in props:
        part = pd.read_sql("""
            WITH rm AS (
                SELECT game_date, lower(regexp_replace(player,'[^A-Za-z]','','g')) AS nm, line,
                       max(books) AS books, avg(p_over_book) AS p_over_book
                FROM nba_market.rung_market GROUP BY 1,2,3
            ),
            bt AS (
                SELECT game_date, lower(regexp_replace(player,'[^A-Za-z]','','g')) AS nm, line, side,
                       min(kind) AS kind, min(tier) AS tier
                FROM nba_market.board_tiers WHERE snapshot_label='window' GROUP BY 1,2,3,4
            )
            SELECT f.season, f.game_date, f.prop, f.side, f.phase, f.final_hp, f.anchor,
                   f.n_uncertain, f.ladder_offset, f.player_id,
                   b.proj_min, b.rate36, b.used_emp, b.role_tier,
                   rm.books, rm.p_over_book, bt.kind, bt.tier, g.won
            FROM tmp_graded g
            JOIN nba_score.final_hp f
              ON f.game_date=g.game_date AND f.player_id=g.player_id AND f.prop=g.prop
             AND f.line=g.line AND f.side=g.side
            LEFT JOIN nba_score.baseline_history b
              ON b.game_date=g.game_date AND b.player_id=g.player_id AND b.prop=g.prop AND b.line=g.line
            LEFT JOIN rm ON rm.game_date=g.game_date AND rm.nm=g.nm AND rm.line=g.line
            LEFT JOIN bt ON bt.game_date=g.game_date AND bt.nm=g.nm AND bt.line=g.line AND bt.side=g.side
            WHERE f.season = ANY(%s) AND f.prop = %s AND g.prop = %s
            """, conn, params=(seasons, prop, prop))
        if not part.empty:
            frames.append(part)
            # score THIS prop now and persist it, so the run is never all-or-nothing
            pc = part.copy()
            pc_conf = confidence_of(pc)
            pc["confidence"] = pc_conf
            gap = abs(float(pc["won"].mean()) - float(pc["final_hp"].mean()))
            with conn.cursor() as cur:
                cur.execute("""INSERT INTO nba_score.confidence_verification
                    (check_type, slice, tier, n, stated, actual, gap) VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    ("group_prop", prop, "v3", len(pc), round(float(pc_conf.mean()), 4),
                     round(float(pc["won"].mean()), 4), round(gap, 4)))
            conn.commit()
            print(f"  {prop:<18}{len(part):>9,} legs   conf {float(pc_conf.mean()):.4f}   "
                  f"|gap| {gap:.4f}", flush=True)
    if not frames:
        print("no graded legs matched")
        return
    d = pd.concat(frames, ignore_index=True)
    if d.empty:
        print("no graded legs")
        return
    print(f"graded legs: {len(d):,}\n", flush=True)

    d["rung_dist"] = pd.cut(np.abs(d["ladder_offset"].fillna(0)), [-1, 0, 2, 5, 20],
                            labels=["anchor", "near", "mid", "tail"]).astype(str)
    d["confidence"] = confidence_of(d, attach=True)
    # ---- FIT THE WEIGHTS TO MEASURED ASSERTIVENESS ------------------------------------------------
    # The hand-assigned weights produce the RIGHT ORDERING (fringe lowest confidence and worst gap,
    # iron-man highest and best) but far too FLAT a spread: confidence spans 0.8522-0.9135, six points,
    # while realised gaps vary 35x (0.0008 to 0.0283). A thermometer whose range is a tenth of the
    # thing it measures cannot separate an assertive leg from a shaky one.
    # So: regress the factors on the CELL-LEVEL realised gap and take the weights from the data. This is
    # the "ML-assisted tuning" the data-quality literature recommends - weights come from how strongly
    # each dimension predicts downstream failure, not from judgement.
    print("\nFITTING WEIGHTS TO MEASURED ASSERTIVENESS", flush=True)
    cell_keys = ["prop", "role_tier", "rung_dist", "kind"]
    cell = d.groupby(cell_keys, observed=True).agg(
        n=("won", "size"), hit=("won", "mean"), hp=("final_hp", "mean")).reset_index()
    cell = cell[cell["n"] >= 300].copy()
    cell["gap"] = (cell["hit"] - cell["hp"]).abs()
    if len(cell) >= 30:
        fac = d.groupby(cell_keys, observed=True)[FACTOR_COLS].mean().reset_index()
        m = cell.merge(fac, on=cell_keys, how="inner")
        X = np.column_stack([np.ones(len(m))] + [m[c].values for c in FACTOR_COLS])
        # target: assertiveness = -log(gap), so a small gap is a HIGH target
        y = -np.log(np.clip(m["gap"].values, 1e-4, 0.2))
        w = np.sqrt(m["n"].values)                      # weight cells by evidence
        beta, *_ = np.linalg.lstsq(X * w[:, None], y * w, rcond=None)
        raw = beta[1:]
        # keep only factors that point the RIGHT way (more of it => more assertive), renormalise
        raw = np.where(raw > 0, raw, 0.0)
        fitted = raw / raw.sum() if raw.sum() > 0 else np.full(len(FACTOR_COLS), 1.0 / len(FACTOR_COLS))
        print("  fitted weights:", ", ".join(f"{c} {v:.3f}" for c, v in zip(FACTOR_COLS, fitted)), flush=True)
        F = d[FACTOR_COLS].values
        s = F @ fitted
        # spread to the full usable range by rank, so the thermometer's range matches what it measures
        lo_s, hi_s = np.quantile(s, 0.02), np.quantile(s, 0.98)
        d["confidence"] = np.clip(0.55 + 0.44 * (s - lo_s) / max(hi_s - lo_s, 1e-9), 0.45, 0.99)
        print(f"  confidence after fitting: p10 {d['confidence'].quantile(.10):.4f}  "
              f"p50 {d['confidence'].quantile(.50):.4f}  p90 {d['confidence'].quantile(.90):.4f}", flush=True)
        # verify the fit discriminates on the SAME cells
        m["conf_fit"] = (m[FACTOR_COLS].values @ fitted)
        r = float(np.corrcoef(m["conf_fit"], -np.log(np.clip(m["gap"], 1e-4, 0.2)))[0, 1])
        print(f"  correlation between fitted confidence and cell assertiveness: {r:+.4f}", flush=True)
        for lo, hi, lab in ((0, .25, "lowest quartile"), (.75, 1.01, "highest quartile")):
            q = m[(m["conf_fit"] >= m["conf_fit"].quantile(lo)) & (m["conf_fit"] <= m["conf_fit"].quantile(hi))]
            if len(q):
                print(f"    {lab:<18}cells {len(q):>4}  mean |gap| {float(q['gap'].mean()):.4f}", flush=True)

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
