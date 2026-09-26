#!/usr/bin/env python3
"""
BOARD-SCOPED SCORER — the calculation half of P3.

WHAT IT SCORES. Every leg the apps actually OFFER: all prop lines, every ladder rung the app exposes
(PrizePicks alternates, Underdog's full rung set, Sleeper's variations, Fliff), BOTH directions, and
every variation - goblin, standard, demon. If it is on a board today, it gets a number.

WHAT IT DOES NOT SCORE. The internal +/-10 ladder for every player x 30 props (~140k rungs/day). That
matrix exists for backtesting and coverage work; live, a rung no app offers is a number nobody can use.

WHY P3 IS SHAPED THIS WAY (measured, not assumed). An earlier P3 rebuilt all 8 prop pairs and ran 35+
minutes without finishing - disqualifying for a pipeline that starts at 1:15 PM PT and must be done
before ~1:30. The cost is NOT per-leg scoring; it is REFITTING the recipe (tier tables, factor betas,
dispersion) over three seasons at ~8 minutes per pair. And that refit uses ONLY games strictly before
today, so it is IDENTICAL at 1 AM (P2) and 1:15 PM (P3). P3 refitting it was 64 minutes recomputing a
provably unchanged model.

So the cost here tracks BOARD SIZE and the NUMBER OF STATUS CHANGES - both bounded - and it keeps
scaling as the board grows with new goblins/demons and deeper ladders across four apps.

THE CHAIN, per board leg:
  1. board leg (player, prop, line, side, app, variation)
  2. HP from P2's ladder at that exact rung; if the app offers a rung OUTSIDE the built ladder range,
     interpolate from the two nearest rungs in log-odds (flagged, so it is visible)
  3. availability delta - if this player's team changed status since the day-before report, use the
     re-projected row from build_availability_delta.py instead
  4. as-of calibration shift (cells fitted strictly before today)
  5. confidence (measured deduction model) -> score (0-100, confidence ENHANCES) -> edge
  6. write nba_score.board_scored

Env: DATABASE_URL, BS_ASOF, BS_SEASON, BS_APPS (default all)
"""
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import psycopg

PT = timezone(timedelta(hours=-8))
BREAKEVEN = 0.560
CONF_NEUTRAL = 0.85

# MARKET KEY -> OUR PROP. Verified against the live board (2026-01-15, 21 distinct keys, 12 books) and
# against baseline_history's 30 props. This mapping is NOT optional string-stripping: a naive
# replace(market_key,'player_','') yields "points_rebounds_assists", which matches NOTHING in our
# baseline (we call it "pra") and would have silently dropped the six largest combo groups - PRA alone
# is 15,156 legs on that date. Every board key below has a verified home.
MARKET_TO_PROP = {
    "player_points": "points",
    "player_rebounds": "rebounds",
    "player_assists": "assists",
    "player_threes": "threes_made",            # board says "threes", we say "threes_made"
    "player_blocks": "blocks",
    "player_steals": "steals",
    "player_turnovers": "turnovers",
    "player_points_rebounds_assists": "pra",
    "player_points_rebounds": "pts_reb",
    "player_points_assists": "pts_ast",
    "player_rebounds_assists": "reb_ast",
    "player_blocks_steals": "stocks",          # we DO carry this one
    "player_double_double": "double_double",   # sentinel line -1.0, no ladder - handled below
    # DFS-NATIVE PROPS. These do NOT appear in the NBA board archive (board_snapshots is the Odds API
    # feed): a scan of both seasons found player_fantasy_points on exactly one date, 2026-09-12, and
    # that same snapshot carries player_first_inning_runs - it is MLB data, not NBA. fantasy_score and
    # the period props reach us only through the PrizePicks/Underdog/Sleeper scrapers, which is what
    # the LIVE pipeline reads. Mapped here so they score correctly the moment they arrive.
    "player_fantasy_points": "fantasy_score",
    "player_points_q1": "points_q1",
    "player_rebounds_q1": "rebounds_q1",
    "player_assists_q1": "assists_q1",
    "player_threes_q1": "threes_made_q1",
    "player_points_h1": "points_h1",
    "player_points_h2": "points_h2",
    "player_points_q4": "points_q4",
    # PERIOD SET COMPLETED + DERIVED PROPS (2026-09-25). The baseline carries Q1/Q4/H1/H2 ladders for
    # points, rebounds, assists and threes, and full-game ladders for FTM, FGA, FGM, FTA, 3PA, OREB,
    # DREB and personal fouls - but none of these had a board key here, so the legs could never score.
    # PrizePicks posts them (its API shape: "1H Points", "1H 3-Pointers Made", "FT Made"; third-party
    # market maps list 1Q points and 1Q assists). Every prop the baseline carries now has a key.
    "player_rebounds_h1": "rebounds_h1", "player_assists_h1": "assists_h1", "player_threes_h1": "threes_made_h1",
    "player_rebounds_h2": "rebounds_h2", "player_assists_h2": "assists_h2", "player_threes_h2": "threes_made_h2",
    "player_rebounds_q4": "rebounds_q4", "player_assists_q4": "assists_q4", "player_threes_q4": "threes_made_q4",
    "player_ftm": "ftm", "player_fga": "fga", "player_fgm": "fgm", "player_fta": "fta",
    "player_threes_attempted": "fg3a", "player_oreb": "oreb", "player_dreb": "dreb",
    "player_personal_fouls": "personal_fouls",
}


def norm_market(mk: str) -> str:
    """board key -> our prop. '_alternate' marks a ladder rung, not a different market."""
    base = str(mk or "").replace("_alternate", "")
    return MARKET_TO_PROP.get(base, "")


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -20, 20)))


def main():
    asof = os.environ.get("BS_ASOF") or datetime.now(PT).date().isoformat()
    # PRUNED SLATES ARE FINAL (2026-09-24). After a slate is graded, P2 prunes its baseline to the rungs
    # the boards offered. Re-scoring it afterwards would re-interpolate the off-ladder legs (~11% on a
    # sample slate) from far-apart board rungs and OVERWRITE their day-of values in board_scored with
    # worse ones. Day-of scoring always precedes the prune, so this guard only ever stops a replay.
    conn0 = psycopg.connect(os.environ["DATABASE_URL"])
    with conn0.cursor() as cur0:
        cur0.execute("SELECT to_regclass('nba_score.baseline_prune_log')")
        if cur0.fetchone()[0] is not None:
            cur0.execute("SELECT pruned_at FROM nba_score.baseline_prune_log WHERE game_date = %s", (asof,))
            row0 = cur0.fetchone()
            if row0 and os.environ.get("BS_FORCE_RESCORE", "0") != "1":
                print(f"REFUSED: {asof} was pruned to the board on {row0[0]}. Its board_scored rows are the day-of "
                      f"record and a re-score would degrade the interpolated legs. Set BS_FORCE_RESCORE=1 to override.",
                      flush=True)
                conn0.close()
                return
    conn0.close()
    # SEASON (T23-2, fixed 2026-09-23). This used to default to a hardcoded "2025-26", so from the
    # first 2026-27 date the scorer would run against a season with no data - and P3 has no cron yet,
    # so the first scheduled run would have been the first failure. The shared helper is the one
    # source of truth (it also honours an NBA_SEASON override, and returns the season that actually
    # HAS game data, which differs from the calendar season in the Jul-Sep off-season).
    import sys
    sys.path.insert(0, "nba")
    from nba_season import current_season
    from datetime import date as _date
    # LABEL BY THE SLATE'S SEASON (2026-09-25). `season` is only written as board_scored.season, and the
    # as-of calibration groups by it. active_stats_season() answers "which season has game data" - on
    # opening morning that is still last season, so October 20 legs would have been labelled 2025-26
    # and pooled into last season's cells. The slate's own season is a function of its date.
    season = os.environ.get("BS_SEASON") or current_season(_date.fromisoformat(asof))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    # 1) THE BOARD - every leg offered today, every app, every rung, both directions.
    # SOURCE. Live, the board comes from OUR SCRAPERS (PrizePicks, Underdog, Sleeper, Fliff) - those
    # are the apps actually played, and they carry the DFS-only markets (fantasy_score, period props,
    # goblins/demons) that the Odds API feed does not. board_snapshots is the ODDS API archive: it has
    # 12 books and 21 market keys and is the right SIMULATION source for a past date, but it is NOT the
    # live board. BS_SOURCE selects; replay defaults to the archive because that is what exists for a
    # past date.
    source = os.environ.get("BS_SOURCE", "archive").lower()
    board = pd.read_sql("""
        SELECT b.bookmaker AS app, b.player, b.market_key, b.line, b.side, b.multiplier,
               m.player_id
        FROM nba_market.board_snapshots b
        LEFT JOIN nba_ref.player_name_map m
               ON m.norm_name = nba_ref.norm_name(b.player)
        -- ONE NORMALISER (2026-09-25). This join used an inline lower(regexp_replace(...,'[^A-Za-z]',''))
        -- that KEPT name suffixes, while player_name_map was built by nba_names.norm_name, which STRIPS
        -- them. "Jaren Jackson Jr" -> jarenjacksonjr vs map jarenjackson: no match. Measured: 47 suffixed
        -- players (Jr, Sr, II, III) had ZERO scored legs in either season - invisible to scoring, tiers,
        -- final_hp, the delta and the paper log. nba_ref.norm_name mirrors the Python function exactly.
        WHERE b.game_date = %s
    """, conn, params=(asof,))
    if board.empty:
        print(f"No board legs for {asof}. Nothing to score.")
        return
    raw = len(board)
    # BS_APPS (documented in the header since the first version, never read until 2026-09-26). Blank =
    # every app, which is the production default; a comma list restricts a replay or a test.
    _apps = [a.strip().lower() for a in os.environ.get("BS_APPS", "").split(",") if a.strip()]
    if _apps:
        board = board[board["app"].str.lower().isin(_apps)].copy()
        print(f"  BS_APPS={_apps}: {len(board):,} of {raw:,} legs kept", flush=True)
        if board.empty:
            print("No board legs for those apps. Nothing to score.")
            return
    board["prop"] = board["market_key"].map(norm_market)
    unmapped_keys = sorted(set(board.loc[board["prop"] == "", "market_key"]))
    if unmapped_keys:
        # LOUD, not silent. An unmapped key is a whole prop group scoring nothing.
        print(f"  UNMAPPED MARKET KEYS (these legs will NOT be scored): {unmapped_keys}", flush=True)
    board = board[board["prop"] != ""].copy()
    # double_double carries a sentinel line of -1.0 - it is a Yes/No market with no ladder
    dd = int((board["prop"] == "double_double").sum())
    board = board[~((board["prop"] == "double_double") & (board["line"] < 0))].copy()
    before = len(board)
    board = board.drop_duplicates(subset=["app", "player_id", "prop", "line", "side"])
    unmapped = int(board["player_id"].isna().sum())
    board = board[board["player_id"].notna()].copy()
    print(f"board legs for {asof} [{source}]: {raw:,} raw -> {len(board):,} scoreable "
          f"({unmapped:,} no player_id, {dd:,} double_double sentinel rows)", flush=True)
    print(f"  by app: {board.groupby('app').size().sort_values(ascending=False).head(8).to_dict()}", flush=True)
    print(f"  by prop: {board.groupby('prop').size().sort_values(ascending=False).head(12).to_dict()}", flush=True)

    # 2) HP FROM P2's LADDER at the exact rung
    # 🔴 ONE BASELINE STORE (owner decision 2026-09-24: one set per day). Until today P2's loader wrote
    # nba_score.baseline_ladder while the season backfill wrote nba_score.baseline_history, and this
    # scorer read history - a table P2 never touched - so on opening night it would have aborted with
    # "P2 must run before P3" AFTER P2 ran. The loader now writes baseline_history for the slate
    # (delete-by-date, rewrite), so history and the live day are the same table and this reads it alone.
    # Full-game rungs carry period 'FULL' (verified across both seasons); the Q1/Q4/H1/H2 rungs are
    # excluded because an unfiltered read duplicated a full-game row wherever a period rung shared its line.
    # PERIOD-AWARE (2026-09-25). Period legs ("1Q Points", "1H Points" - PrizePicks posts them, verified
    # against its API shape and third-party market maps) map to props like points_q1, but the store keeps
    # them as prop='points', period='Q1'. Until now those legs never found a rung. The board leg carries
    # its period, the read returns every period, and the merge keys on the base prop + period. Full-game
    # legs are period 'FULL' and behave exactly as before.
    _PER = {"_q1": "Q1", "_q2": "Q2", "_q3": "Q3", "_q4": "Q4", "_h1": "H1", "_h2": "H2"}
    def _split(p):
        for suf, per in _PER.items():
            if p.endswith(suf):
                return p[:-len(suf)], per
        return p, "FULL"
    board["prop_base"], board["period"] = zip(*board["prop"].map(_split))
    lad = pd.read_sql("""
        SELECT player_id, prop AS prop_base, coalesce(period, 'FULL') AS period, line, p_more, p_less,
               anchor, ladder_offset, role_tier, used_emp
        FROM nba_score.baseline_history WHERE game_date = %s
    """, conn, params=(asof,))
    if lad.empty:
        print(f"ABORT: no baseline for {asof} in nba_score.baseline_history - P2 must run before P3.")
        raise SystemExit(1)
    print(f"  baseline: nba_score.baseline_history - {len(lad):,} rungs "
          f"({int((lad['period'] == 'FULL').sum()):,} full-game, {int((lad['period'] != 'FULL').sum()):,} period)", flush=True)
    lad["player_id"] = lad["player_id"].astype(str)
    lad["line"] = lad["line"].astype(float)
    board["player_id"] = board["player_id"].astype(str)
    board["line"] = board["line"].astype(float)

    d = board.merge(lad, on=["player_id", "prop_base", "period", "line"], how="left")
    exact = int(d["p_more"].notna().sum())
    print(f"  exact ladder hits: {exact:,} / {len(d):,} ({exact/len(d):.1%})", flush=True)

    # 2b) rungs the app offers OUTSIDE our built ladder - interpolate in log-odds from the two nearest
    # rungs for that player+prop+period. Flagged so a deep alternate is never mistaken for a fitted rung.
    miss = d[d["p_more"].isna()]
    if len(miss):
        by = {k: g.sort_values("line") for k, g in lad.groupby(["player_id", "prop_base", "period"])}
        fills = []
        for r in miss.itertuples(index=False):
            g = by.get((r.player_id, r.prop_base, r.period))
            if g is None or len(g) < 2:
                fills.append((np.nan, np.nan)); continue
            lo = g[g["line"] <= r.line].tail(1)
            hi = g[g["line"] >= r.line].head(1)
            if lo.empty or hi.empty:          # beyond both ends - clamp to the nearest fitted rung
                near = (lo if hi.empty else hi).iloc[0]
                fills.append((float(near["p_more"]), float(near["p_less"]))); continue
            l0, l1 = float(lo["line"].iloc[0]), float(hi["line"].iloc[0])
            w = 0.0 if l1 == l0 else (r.line - l0) / (l1 - l0)
            pm = sigmoid((1 - w) * logit(float(lo["p_more"].iloc[0])) + w * logit(float(hi["p_more"].iloc[0])))
            fills.append((float(pm), float(1 - pm)))
        d.loc[d["p_more"].isna(), "p_more"] = [f[0] for f in fills]
        d.loc[d["p_less"].isna(), "p_less"] = [f[1] for f in fills]
        d["interpolated"] = d.index.isin(miss.index)
        print(f"  interpolated off-ladder rungs: {int(d['interpolated'].sum()):,}", flush=True)
    else:
        d["interpolated"] = False

    d = d[d["p_more"].notna()].copy()
    d["baseline_hp"] = np.where(d["side"].str.lower().str.startswith("o"),
                                d["p_more"].astype(float), d["p_less"].astype(float))

    # 3) AVAILABILITY DELTA - teams whose status changed since the day-before report
    try:
        adj = pd.read_sql("""SELECT player_id, prop, line, side, old_hp, new_hp, reason
                             FROM nba_score.availability_delta WHERE game_date = %s""",
                          conn, params=(asof,))
        if not adj.empty:
            adj["player_id"] = adj["player_id"].astype(str); adj["line"] = adj["line"].astype(float)
            # 🔴 BOUND THE MOVE, NOT THE LEVEL (2026-09-24, measured). The producer used to price a late
            # Out at 0.001/0.999 on every one of that player's legs: log-loss 5.7938 vs 0.8326 for leaving
            # them alone, because a genuine DNP VOIDS (the override never pays) and the only legs that
            # reach grading are ones where the listing REVERSED (2025-11-29: Klay Thompson, Out at 15:30
            # ET, Available at 16:30, 25.9 min, 23 pts).
            # The threshold is measured, not chosen: the teammate reallocation - the part that scored
            # BETTER (0.6119 -> 0.6076) - moves a probability by mean 0.013, p99 0.043, MAX 0.0496. A cap
            # at 0.15 is 3x its observed maximum, so nothing legitimate is touched.
            # ⚠ A LEVEL-based filter would be WRONG here: 1,556 legitimate reallocated rows sit at
            # extreme levels (<=0.02 / >=0.98) because they are far-out alternate rungs where an extreme
            # probability is correct - they move by hundredths. The pathology is the MOVE, not the level.
            n_in = len(adj)
            move = (adj["new_hp"].astype(float) - adj["old_hp"].astype(float)).abs()
            adj = adj[(move <= 0.15) & (~adj["reason"].astype(str).str.startswith("now_out"))]
            if len(adj) < n_in:
                print(f"  availability overrides REJECTED (move > 0.15 or now_out): {n_in - len(adj):,}",
                      flush=True)
            adj = adj.drop(columns=["reason", "old_hp"])
            d = d.merge(adj, on=["player_id", "prop", "line", "side"], how="left")
            n_adj = int(d["new_hp"].notna().sum())
            d["baseline_hp"] = d["new_hp"].fillna(d["baseline_hp"]).astype(float)
            print(f"  legs re-projected from the day-of report: {n_adj:,}", flush=True)
    except Exception as exc:  # noqa: BLE001
        # ROLLBACK IS MANDATORY HERE. Catching the exception is not enough: psycopg leaves the
        # connection in a FAILED TRANSACTION, so every later query dies with InFailedSqlTransaction and
        # the traceback points at the innocent query instead of this one. The delta table legitimately
        # may not exist yet, so this path is normal - it must not poison the rest of the run.
        conn.rollback()
        print(f"  no availability delta applied ({str(exc)[:60]})", flush=True)

    # 4) AS-OF CALIBRATION - the latest cell published at or before today
    # PHASE MUST MATCH THE FIT. build_asof_calibration.phase_of splits on Feb 15 and Mar 16. Until 2026-09-21 a
    # month-only rule here applied the wrong phase's cells on Feb 1-14 (fit: 2_dec_asb) and Mar 16-31 (fit: 4_push).
    _dd = datetime.fromisoformat(asof)
    _m, _day = _dd.month, _dd.day
    ph = ("1_oct_nov" if _m in (10, 11) else
          "2_dec_asb" if _m in (12, 1) or (_m == 2 and _day < 15) else
          "3_post_asb" if (_m == 2 and _day >= 15) or (_m == 3 and _day < 16) else "4_push")
    cal = pd.read_sql("""SELECT DISTINCT ON (prop, band, side) prop, band, side, log_odds_shift
                         FROM nba_score.ladder_calibration_asof
                         WHERE as_of_date <= %s AND phase = %s
                         ORDER BY prop, band, side, as_of_date DESC""", conn, params=(asof, ph))
    shift = {(r.prop, r.band, r.side): float(r.log_odds_shift) for r in cal.itertuples(index=False)}
    BANDS = [0, .40, .45, .50, .55, .60, .65, .70, .75, .80, .85, 1.0]
    d["band"] = pd.cut(d["baseline_hp"], BANDS).astype(str)
    d["side_n"] = np.where(d["side"].str.lower().str.startswith("o"), "Over", "Under")
    d["cal_shift"] = [shift.get((p, b, s), 0.0) for p, b, s in zip(d["prop"], d["band"], d["side_n"])]
    d["final_hp"] = sigmoid(logit(d["baseline_hp"].values) + d["cal_shift"].values)

    # 5) CONFIDENCE (measured deductions) -> SCORE (0-100, confidence ENHANCES) -> EDGE
    cm = pd.read_sql("SELECT factor, deduction, base, floor FROM nba_score.confidence_model", conn)
    ded = {r.factor: float(r.deduction) for r in cm.itertuples(index=False) if float(r.deduction) > 0}
    BASE = float(cm["base"].iloc[0]) if not cm.empty else 99.0
    FLOOR = float(cm["floor"].iloc[0]) if not cm.empty else 55.0
    ROLE = {"IRON_MAN": 1.0, "HIGH_USAGE_STARTER": 0.97, "STARTER": 0.93,
            "ROTATION": 0.85, "BENCH": 0.70, "FRINGE": 0.50}
    books = d.groupby(["player_id", "prop", "line", "side"])["app"].transform("nunique").values
    fmap = {
        "f_complete": d["anchor"].notna().values.astype(float) * 0.4 + 0.6,
        "f_prov": np.where(d["used_emp"].fillna(False).values, 1.0, 0.30),
        "f_time": np.full(len(d), 1.0),
        "f_depth": np.clip(1.0 - np.abs(d["ladder_offset"].fillna(0).values) / 14.0, 0.25, 1.0),
        "f_role": d["role_tier"].map(ROLE).fillna(0.75).values,
        "f_vol": np.full(len(d), 0.75),
        "f_exp": np.full(len(d), 0.75),
        "f_books": np.clip(books / 4.0, 0, 1),          # corroboration ACROSS APPS
        "f_agree": np.full(len(d), 0.55),
        "f_phase": np.full(len(d), {"1_oct_nov": 0.80, "2_dec_asb": 1.00,
                                    "3_post_asb": 0.88, "4_push": 0.92}[ph]),
    }
    lost = np.zeros(len(d))
    for k, v in ded.items():
        if k in fmap:
            lost = lost + (1.0 - np.clip(fmap[k], 0, 1)) * v
    # an interpolated rung is genuinely less supported than a fitted one - say so
    lost = lost + np.where(d["interpolated"].values, 4.0, 0.0)
    d["confidence"] = np.clip(BASE - lost, FLOOR, 99.5) / 100.0

    hp100 = d["final_hp"].values * 100.0
    cdev = (d["confidence"].values - CONF_NEUTRAL) / (1.0 - CONF_NEUTRAL)
    lift = np.clip(cdev, 0, 1) * 0.50
    drop = np.clip(-cdev, 0, 1) * 0.35
    d["score"] = np.round(np.clip(hp100 + (100.0 - hp100) * lift - hp100 * drop, 0, 100), 2)
    d["edge"] = np.round((d["final_hp"].values - BREAKEVEN) * 100.0, 2)

    # 6) WRITE
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.board_scored (
            game_date date, season text, app text, player_id text, player text, prop text,
            line numeric, side text, kind text, tier int, game_id text,
            baseline_hp numeric, cal_shift numeric, final_hp numeric,
            confidence numeric, score numeric, edge numeric, interpolated boolean,
            built_at timestamptz DEFAULT now())""")
        # DEADLOCK FIX (2026-09-21). CREATE INDEX IF NOT EXISTS takes a SHARE lock on the table BEFORE it
        # discovers the index exists, and holds it to the end of this transaction. Two scorers running at once
        # (the history replay's parallel chunks) each held SHARE, then each waited on the other for ROW EXCLUSIVE
        # to DELETE - a deadlock that failed 181 of 325 replay dates. Create the index only when it is missing.
        if cur.execute("SELECT to_regclass('nba_score.board_scored_uidx')").fetchone()[0] is None:
            cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS board_scored_uidx
                ON nba_score.board_scored (game_date, app, player_id, prop, line, side)""")
        cur.execute("DELETE FROM nba_score.board_scored WHERE game_date = %s", (asof,))
        cur.executemany("""INSERT INTO nba_score.board_scored
            (game_date, season, app, player_id, player, prop, line, side, kind, tier, game_id,
             baseline_hp, cal_shift, final_hp, confidence, score, edge, interpolated)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (game_date, app, player_id, prop, line, side) DO UPDATE SET
              final_hp=EXCLUDED.final_hp, confidence=EXCLUDED.confidence,
              score=EXCLUDED.score, edge=EXCLUDED.edge""",
            [(asof, season, r.app, r.player_id, r.player, r.prop, float(r.line), r.side_n,
              None, None, None,
              round(float(r.baseline_hp), 5), round(float(r.cal_shift), 5), round(float(r.final_hp), 5),
              round(float(r.confidence), 4), float(r.score), float(r.edge), bool(r.interpolated))
             for r in d.itertuples(index=False)])
    conn.commit()
    print(f"\nscored {len(d):,} board legs for {asof}", flush=True)
    print(f"  mean final_hp {d['final_hp'].mean():.4f}  mean confidence {d['confidence'].mean():.4f}  "
          f"mean score {d['score'].mean():.1f}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
