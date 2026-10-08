#!/usr/bin/env python3
"""
PRUNE THE BASELINE TO THE BOARD - owner rule 2026-09-24.

"Whatever shows on the board, the full ladder for all players, all prop lines, everything, we save.
 If a player shows one single leg, we save one single leg. We don't need to save more and less."

DAY-OF the baseline is the full spectrum - it is built before anyone knows which lines the apps will
post, and its width is what lets the scorer hit the exact rung. Once the board is known the off-board
rungs have no consumer: the build never reads a previous baseline (classification_ladder_v12 and the
patcher hold zero references to baseline_history / baseline_ladder / final_hp and open no database
connection), final_hp is built board-scoped, the calibration and confidence refits join from graded
board legs, and interpolation for off-ladder lines happens day-of and is already recorded in
board_scored. Measured 2026-04-10: 49,816 rungs for the 12 standard props on PrizePicks, 4,863 on the
board - 9.8%.

WHAT IS KEPT for a slate: every (player, prop, period, line) that appeared on ANY app's board, ANY
snapshot label, that day - the REAL boards - UNION the DERIVED boards (the simulated fantasy-score and
derived-prop legs in nba_market.prop_universe). Board keys are resolved exactly as build_final_hp and
score_board_legs resolve them - the scorer's MARKET_TO_PROP and nba_ref.player_name_map - so there is
one vocabulary.

SCOPE (owner correction 2026-09-24: "the derived we keep; if they're not derived, we need to redo it
anyway"): a (date, prop, period) is pruned ONLY IF some board - real or derived - carried that prop
that day. A prop with no board of any kind (historically the PERIOD props) keeps its full ladder: it is
the raw material the derivation will run on.

Modes:
  PRUNE_DATE=YYYY-MM-DD   one slate (P2 runs this for YESTERDAY after grading)
  PRUNE_SEASON=2025-26    every date of a season, ONE DATE PER TRANSACTION (historical clean-up)
  PRUNE_DRY_RUN=1         report counts, delete nothing

Env: DATABASE_URL, PRUNE_DATE | PRUNE_SEASON, PRUNE_DRY_RUN
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg

sys.path.insert(0, "nba")
from score_board_legs import MARKET_TO_PROP  # noqa: E402

PERIOD_SUFFIX = {"_q1": "Q1", "_q4": "Q4", "_h1": "H1", "_h2": "H2"}


def split_period(prop):
    """'points_q1' -> ('points', 'Q1'); 'points' -> ('points', 'FULL'). Matches baseline_history's shape."""
    for suf, per in PERIOD_SUFFIX.items():
        if prop.endswith(suf):
            return prop[: -len(suf)], per
    return prop, "FULL"


def main():
    dry = os.environ.get("PRUNE_DRY_RUN", "0") == "1"
    one_date = (os.environ.get("PRUNE_DATE") or "").strip()
    season = (os.environ.get("PRUNE_SEASON") or "").strip()
    if not one_date and not season:
        from zoneinfo import ZoneInfo
        one_date = (datetime.now(ZoneInfo("America/Los_Angeles")).date() - timedelta(days=1)).isoformat()   # round 2: real PT clock
        print(f"no PRUNE_DATE / PRUNE_SEASON given - defaulting to yesterday PT: {one_date}", flush=True)

    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")

    pairs = ",".join("(%s,%s,%s)" for _ in MARKET_TO_PROP)
    flat = []
    for mk, pr in MARKET_TO_PROP.items():
        base, per = split_period(pr)
        flat += [mk, base, per]

    if one_date:
        scope_sql, scope_params, label = "b.game_date = %s", [one_date], one_date
        hist_scope_sql, hist_params = "h.game_date = %s", [one_date]
    else:
        scope_sql = "b.game_date IN (SELECT DISTINCT game_date FROM nba_score.baseline_history WHERE season = %s)"
        scope_params, label = [season], season
        hist_scope_sql, hist_params = "h.season = %s", [season]

    with conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(hashtext('nba_score.baseline_history'))")
        cur.execute("DROP TABLE IF EXISTS _prune_keys")
        # THE BOARD, from nba_market.board_rung_keys (2026-09-25): real boards UNION derived boards, resolved
        # once per date through the one normaliser. Same table the history loader and build_final_hp read.
        cur.execute(f"""
            CREATE TEMP TABLE _prune_keys AS
            SELECT game_date, player_id, prop, period, line FROM nba_market.board_rung_keys b
            WHERE {scope_sql}""", scope_params)
        cur.execute("SELECT count(*) FROM _prune_keys")
        if cur.fetchone()[0] == 0 and season:
            raise SystemExit(f"ABORT: nba_market.board_rung_keys has no keys for season {season} - refresh it first "
                             f"(a missing key table is not an empty board).")
        cur.execute("CREATE INDEX ON _prune_keys (game_date, player_id, prop, period, line)")
        cur.execute("""CREATE TEMP TABLE _prune_scope AS
                       SELECT DISTINCT game_date, prop, period FROM _prune_keys""")
        cur.execute("CREATE INDEX ON _prune_scope (game_date, prop, period)")
        cur.execute("SELECT count(*), count(DISTINCT game_date) FROM _prune_keys")
        nk, nd = cur.fetchone()
        cur.execute(f"SELECT count(*) FROM nba_score.baseline_history h WHERE {hist_scope_sql}", hist_params)
        before = cur.fetchone()[0]
        cur.execute(f"""SELECT count(*) FROM nba_score.baseline_history h
                        WHERE {hist_scope_sql} AND NOT EXISTS (
                          SELECT 1 FROM _prune_scope s WHERE s.game_date = h.game_date AND s.prop = h.prop AND s.period = h.period)""",
                    hist_params)
        unboarded = cur.fetchone()[0]
        cur.execute(f"""SELECT count(*) FROM nba_score.baseline_history h
                        WHERE {hist_scope_sql} AND EXISTS (
                          SELECT 1 FROM _prune_keys k WHERE k.game_date = h.game_date AND k.player_id = h.player_id
                            AND k.prop = h.prop AND k.period = h.period AND k.line = h.line)""", hist_params)
        keep = cur.fetchone()[0]
        to_delete = before - keep - unboarded
        print(f"[{label}] board keys: {nk:,} across {nd} dates | baseline rows: {before:,} | on a board: {keep:,} | "
              f"kept as NEVER-DERIVED (no board of any kind for that prop/day): {unboarded:,} | "
              f"to delete: {to_delete:,} ({100.0 * to_delete / max(before, 1):.1f}%)", flush=True)
        if dry:
            print("DRY RUN - nothing deleted.", flush=True)
            conn.rollback()
            return
        if before == 0:
            # No baseline was built for this scope - a preseason day, an off day, or a date P2 skipped.
            # Nothing to prune is not a failure. (Preseason is rejected for the projection pipeline;
            # only its boards are captured, so a preseason board with no baseline is the normal case.)
            print(f"No baseline rows for {label} - nothing to prune.", flush=True)
            conn.rollback()
            return
        if nk == 0:
            # Distinguish an off day from a missing archive. No regular-season games -> nothing to prune,
            # exit green (P2 runs every morning and must not go red for a day the league did not play).
            # Games but no board keys -> the archive is missing for a real slate; refuse and fail loud.
            games = 0
            if one_date:
                cur.execute("SELECT count(*) FROM nba_calendar.slate_games WHERE game_date = %s", (one_date,))   # §31w P-6
                games = cur.fetchone()[0]
            if games == 0:
                print(f"No games on {label} - nothing to prune.", flush=True)
                conn.rollback()
                return
            print(f"{games} games on {label} but NO board keys - the archive is missing; refusing to delete "
                  f"(a missing board is not an empty board).", flush=True)
            conn.rollback()
            sys.exit(1)
        if keep == 0:
            # Board keys exist but NONE matched a baseline row. A real board always overlaps the ladder
            # (measured: 12-23% of rungs). Zero overlap means a vocabulary or convention mismatch - a
            # period marker, a name map, a player_id format - and deleting on it would wipe the slate.
            print(f"REFUSED: {nk:,} board keys matched 0 of {before:,} baseline rows for {label} - "
                  f"that is a convention mismatch, not an empty board. Nothing deleted.", flush=True)
            conn.rollback()
            sys.exit(1)
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_score.baseline_prune_log (
            game_date date PRIMARY KEY, rows_kept bigint, rows_deleted bigint, pruned_at timestamptz DEFAULT now())""")
        cur.execute("SELECT DISTINCT game_date FROM _prune_keys ORDER BY 1")
        dates = [r[0] for r in cur.fetchall()]
    conn.commit()   # releases the advisory lock taken for the key build; each date below takes its own

    # PER-DATE BATCHES (2026-09-24). The first season execution ran as ONE transaction: a 5.35M-row
    # DELETE with correlated EXISTS / NOT EXISTS checks against 9.7M rows, I/O-bound for over an hour
    # with no visible progress and everything riding on a single commit. Same rule, same keys - but
    # one date per transaction: ~30k rows each, progress printed as it goes, and a stop or timeout
    # loses at most one date's work instead of all of it. A rerun finds nothing left to do on dates
    # already pruned. A PRUNED SLATE MUST NEVER BE RE-SCORED: score_board_legs reads
    # baseline_prune_log and refuses a pruned date, because re-interpolating off-ladder legs from
    # far-apart board rungs would overwrite board_scored's day-of values with degraded ones.
    total_deleted = 0
    # THE FULL LADDER MUST BE IN GIT BEFORE ITS OFF-BOARD RUNGS ARE DELETED (retention audit 2026-10-08). The prune is the
    # one deliberate loss in the database; the only full copy of a live slate's ladder is nba/data/nba_baseline_ladder_<date>
    # .json.gz, which P2B commits through git_push_retry.sh - a failed push is a warning there, not an abort. So a live-season
    # date is pruned only when its dated ladder file exists in this checkout (the P2A runner checks out main). Historical
    # dates (the two backfilled seasons) never had a file and keep the documented board-scoped rule. PRUNE_SKIP_FILE_CHECK=1
    # overrides, deliberately.
    from pathlib import Path as _P
    from datetime import date as _date
    _live_floor = _date(2026, 7, 1)
    if os.environ.get("PRUNE_SKIP_FILE_CHECK") != "1":
        held = []
        for d in dates:
            if d >= _live_floor and not any((_P("nba/data") / f"nba_baseline_ladder_{d.isoformat()}{ext}").exists() for ext in (".json.gz", ".json")):
                held.append(d)
        if held:
            print(f"  HELD (not pruned): {', '.join(x.isoformat() for x in held)} - the dated ladder file is not in the repo checkout; "
                  f"P2B's commit must land first (PRUNE_SKIP_FILE_CHECK=1 overrides)", flush=True)
            dates = [d for d in dates if d not in set(held)]
    for i, d in enumerate(dates, 1):
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(hashtext('nba_score.baseline_history'))")
            cur.execute("""DELETE FROM nba_score.baseline_history h
                           WHERE h.game_date = %s
                             AND EXISTS (SELECT 1 FROM _prune_scope s
                                         WHERE s.game_date = h.game_date AND s.prop = h.prop AND s.period = h.period)
                             AND NOT EXISTS (SELECT 1 FROM _prune_keys k
                                             WHERE k.game_date = h.game_date AND k.player_id = h.player_id
                                               AND k.prop = h.prop AND k.period = h.period AND k.line = h.line)""", (d,))
            n_del = cur.rowcount
            cur.execute("SELECT count(*) FROM nba_score.baseline_history WHERE game_date = %s", (d,))
            n_left = cur.fetchone()[0]
            cur.execute("""INSERT INTO nba_score.baseline_prune_log (game_date, rows_kept, rows_deleted)
                           VALUES (%s, %s, %s)
                           ON CONFLICT (game_date) DO UPDATE SET rows_kept = EXCLUDED.rows_kept,
                             rows_deleted = nba_score.baseline_prune_log.rows_deleted + EXCLUDED.rows_deleted,
                             pruned_at = now()""", (d, n_left, n_del))
        conn.commit()
        total_deleted += n_del
        print(f"  [{i}/{len(dates)}] {d}: deleted {n_del:,}, {n_left:,} left", flush=True)
    print(f"PRUNED|{label}|deleted {total_deleted:,} off-board rungs across {len(dates)} dates, "
          f"kept {keep:,} board rungs + {unboarded:,} never-derived", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
