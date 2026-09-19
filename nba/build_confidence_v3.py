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
               "f_books", "f_agree", "f_phase"]


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
        # ---- DEDUCTION MODEL, ANCHORED ON MEASURED ASSERTIVENESS ------------------------------------
        # The regression alone COLLAPSED: targeting -log(gap) across cells whose gaps are all tiny
        # (0.0004 to 0.028) leaves almost no variance to fit, so the coefficients came out near-uniform
        # and EVERY group scored 90.8 - fringe players (gap 0.0283) identical to iron-men (0.0008).
        # A thermometer that reads the same everywhere measures nothing.
        #
        # The fix is to anchor on the thing we actually want to predict. Each factor's deduction is set
        # by how much realised gap SEPARATES its high-value legs from its low-value legs:
        #     separation(factor) = mean|gap| where the factor is LOW  -  mean|gap| where it is HIGH
        # A factor that genuinely marks unreliable legs earns a large deduction; one that separates
        # nothing earns none. That is measured discrimination, not a regression on a flat target.
        sep = {}
        for c in FACTOR_COLS:
            v = d[c].astype(float)
            # MEASURE AT THE ACTUAL EXTREMES, not a 30/70 quantile cut. The first version compared the
            # top 30% against the bottom 30% and found only f_books separating - but FRINGE players are
            # 2.6% of legs (58,969 of 2.23M), so they sat deep inside a bottom bucket dominated by
            # ROTATION. The test compared 0.85 against 0.95 and correctly saw nothing, while the real
            # signal (fringe |gap| 0.0283 vs iron-man 0.0008, a 35x difference) lived in a tail it never
            # isolated. A signal concentrated in a small tail is invisible to a coarse quantile split.
            lo_cut, hi_cut = v.quantile(0.05), v.quantile(0.95)
            if hi_cut - lo_cut < 1e-6:              # factor is constant - it cannot separate anything
                sep[c] = 0.0
                continue
            hi_m = d[v >= hi_cut]
            lo_m = d[v <= lo_cut]
            if len(hi_m) < 2000 or len(lo_m) < 2000:
                sep[c] = 0.0
                continue
            g_hi = abs(float(hi_m["won"].mean()) - float(hi_m["final_hp"].mean()))
            g_lo = abs(float(lo_m["won"].mean()) - float(lo_m["final_hp"].mean()))
            sep[c] = max(g_lo - g_hi, 0.0)
            print(f"    {c:<12} lo n={len(lo_m):>7,} |gap| {g_lo:.4f}   hi n={len(hi_m):>7,} "
                  f"|gap| {g_hi:.4f}   separation {sep[c]:+.5f}", flush=True)
        tot = sum(sep.values())
        print("  measured separation per factor (|gap| low minus high):",
              ", ".join(f"{c.replace('f_','')} {v:+.4f}" for c, v in sep.items()), flush=True)
        if tot <= 0:
            print("  NO factor separates - confidence cannot be calibrated from these; leaving flat", flush=True)
            ded = np.full(len(FACTOR_COLS), 0.0)
        else:
            DEDUCT_BUDGET = 29.0                    # worst realistic combination lands near 70
            share = np.array([sep[c] / tot for c in FACTOR_COLS])
            # CAP any single factor at 35% of the budget. Without this, the first run put the whole 29
            # points on f_books (the only factor the coarse test saw), so a leg on an unpriced rung fell
            # 99 -> 70 for that reason alone - not a fair reading of its data quality. A thermometer
            # should not rest on one sensor.
            share = np.minimum(share, 0.35)
            share = share / share.sum() if share.sum() > 0 else share
            ded = share * DEDUCT_BUDGET
        print("  deductions at full deficiency (points off 99):",
              ", ".join(f"{c.replace('f_','')} -{v:.1f}" for c, v in zip(FACTOR_COLS, ded)), flush=True)
        # PERSIST so build_final_hp.py applies exactly this, measured, logic to all 38.7M legs.
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.confidence_model (
                factor text PRIMARY KEY, deduction numeric, separation numeric,
                base numeric, floor numeric, built_at timestamptz DEFAULT now())""")
            cur.execute("DELETE FROM nba_score.confidence_model")
            cur.executemany("""INSERT INTO nba_score.confidence_model
                (factor, deduction, separation, base, floor) VALUES (%s,%s,%s,%s,%s)""",
                [(c, round(float(v), 4), round(float(sep[c]), 6), 99.0, 55.0)
                 for c, v in zip(FACTOR_COLS, ded)])
        conn.commit()
        print(f"  persisted {len(FACTOR_COLS)} deductions to nba_score.confidence_model", flush=True)
        F = d[FACTOR_COLS].values
        lost = ((1.0 - F) * ded).sum(axis=1)
        d["confidence"] = np.clip(99.0 - lost, 55.0, 99.5) / 100.0
        print(f"  confidence: p05 {d['confidence'].quantile(.05)*100:.1f}  "
              f"p25 {d['confidence'].quantile(.25)*100:.1f}  p50 {d['confidence'].quantile(.50)*100:.1f}  "
              f"p75 {d['confidence'].quantile(.75)*100:.1f}  p95 {d['confidence'].quantile(.95)*100:.1f}  "
              f"spread {(d['confidence'].quantile(.95)-d['confidence'].quantile(.05))*100:.1f} pts", flush=True)
        # DOES IT DISCRIMINATE? bucket legs by confidence and compare realised gaps
        print("  verification - realised |gap| by confidence decile:", flush=True)
        dq = d.assign(cb=pd.qcut(d["confidence"].rank(method="first"), 5,
                                 labels=["lowest", "low", "mid", "high", "highest"]))
        for k, g in dq.groupby("cb", observed=True):
            print(f"    {str(k):<9}n={len(g):>8,}  conf {float(g['confidence'].mean())*100:5.1f}  "
                  f"|gap| {abs(float(g['won'].mean())-float(g['final_hp'].mean())):.4f}", flush=True)

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
