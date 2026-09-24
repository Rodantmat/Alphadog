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
snapshot label, that day. Everything else for that date is deleted. Board keys are resolved exactly as
build_final_hp and score_board_legs resolve them - the scorer's MARKET_TO_PROP and
nba_ref.player_name_map - so there is one vocabulary.

A prop that had NO board line that day for a player loses that player's rungs for that prop. That is
the rule, stated by the owner, and it is applied identically to history. Historically the Odds API feed
never carried fantasy score, the derived props or the period props, so for those the historical
baseline is removed by this rule; going forward the live PrizePicks board carries them.

Modes:
  PRUNE_DATE=YYYY-MM-DD   one slate (P2 runs this for YESTERDAY after grading)
  PRUNE_SEASON=2025-26    every date of a season (historical clean-up; owner-approved)
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
        one_date = (datetime.now(timezone(timedelta(hours=-8))).date() - timedelta(days=1)).isoformat()
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
        # THE BOARD = the REAL boards (every app, every snapshot label) UNION the DERIVED boards (owner
        # 2026-09-24: "either the real boards or derived, no matter"). The derived boards are the
        # simulated fantasy-score and derived-prop legs in nba_market.prop_universe (line_source =
        # 'simulated'): fantasy_score, fga, fgm, fta, ftm, 3pa, oreb, dreb, and the simulated alternates.
        # Historically the Odds API feed never carried those props, so without this union their entire
        # historical baseline would be deleted - the exact data the derived backsims were built from.
        cur.execute(f"""
            CREATE TEMP TABLE _prune_keys AS
            SELECT DISTINCT b.game_date, m.player_id::text AS player_id, v.prop, v.period, b.line
            FROM nba_market.board_snapshots b
            JOIN (VALUES {pairs}) AS v(mk, prop, period) ON replace(b.market_key, '_alternate', '') = v.mk
            JOIN nba_ref.player_name_map m
              ON m.norm_name = lower(regexp_replace(b.player, '[^A-Za-z]', '', 'g'))
            WHERE b.line IS NOT NULL AND {scope_sql}
            UNION
            SELECT DISTINCT u.game_date, u.player_id::text, u.prop, 'FULL', u.line
            FROM nba_market.prop_universe u
            WHERE u.line_source = 'simulated' AND u.line IS NOT NULL
              AND {scope_sql.replace('b.game_date', 'u.game_date')}""", flat + scope_params + scope_params)
        cur.execute("CREATE INDEX ON _prune_keys (game_date, player_id, prop, period, line)")
        cur.execute("SELECT count(*), count(DISTINCT game_date) FROM _prune_keys")
        nk, nd = cur.fetchone()
        cur.execute(f"SELECT count(*) FROM nba_score.baseline_history h WHERE {hist_scope_sql}", hist_params)
        before = cur.fetchone()[0]
        cur.execute(f"""SELECT count(*) FROM nba_score.baseline_history h
                        WHERE {hist_scope_sql} AND EXISTS (
                          SELECT 1 FROM _prune_keys k WHERE k.game_date = h.game_date AND k.player_id = h.player_id
                            AND k.prop = h.prop AND k.period = h.period AND k.line = h.line)""", hist_params)
        keep = cur.fetchone()[0]
        print(f"[{label}] board keys: {nk:,} across {nd} dates | baseline rows: {before:,} | on a board: {keep:,} "
              f"({100.0 * keep / max(before, 1):.1f}%) | to delete: {before - keep:,}", flush=True)
        if dry:
            print("DRY RUN - nothing deleted.", flush=True)
            conn.rollback()
            return
        if nk == 0:
            # Distinguish an off day from a missing archive. No games -> nothing to prune, exit green
            # (P2 runs every morning and must not go red for a day the league did not play). Games but
            # no board keys -> the archive is missing for a real slate; refuse to delete and fail loud.
            games = 0
            if one_date:
                cur.execute("SELECT count(*) FROM nba_calendar.games WHERE game_date = %s", (one_date,))
                games = cur.fetchone()[0]
            if games == 0:
                print(f"No games on {label} - nothing to prune.", flush=True)
                conn.rollback()
                return
            print(f"{games} games on {label} but NO board keys - the archive is missing; refusing to delete "
                  f"(a missing board is not an empty board).", flush=True)
            conn.rollback()
            sys.exit(1)
        cur.execute(f"""DELETE FROM nba_score.baseline_history h
                        WHERE {hist_scope_sql} AND NOT EXISTS (
                          SELECT 1 FROM _prune_keys k WHERE k.game_date = h.game_date AND k.player_id = h.player_id
                            AND k.prop = h.prop AND k.period = h.period AND k.line = h.line)""", hist_params)
        deleted = cur.rowcount
    conn.commit()
    print(f"PRUNED|{label}|deleted {deleted:,} off-board rungs, kept {keep:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
