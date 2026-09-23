#!/usr/bin/env python3
"""
FACTOR FRESHNESS - is every mined factor actually STORED, and is any fallback silently carrying a game?

WHY THIS EXISTS. Two owner rules meet here: everything mined must be stored (so nothing needs
backfilling later), and every factor needs a working fallback. Both were true on paper and neither was
checked at runtime. The failure mode is not a crash - it is silence: `nba_ref.referee_assignments` sat
EMPTY while P2 ran its scraper nightly, so D1's documented fallback ("factor zero + confidence penalty",
NBA_ENRICHMENT_MINING_AND_FALLBACKS.md section 4) would have carried every game day with nothing saying so.

WHAT IT DOES. For each factor: how fresh is its store, measured against the pipeline that owns it, and
what happens when it is missing.
  BINDING   - the slate cannot be scored honestly without it  -> exit non-zero, the job goes red
  FALLBACK  - a measured fallback exists and takes over       -> reported LOUDLY, job stays green
  WEEKLY    - refreshed by P1, not per slate

SEASON AWARE. Out of season there are no games, no boards and no assignments, and that is not a defect
(2026-09: the NBA season had not started). Nothing is judged unless the schedule says games exist.

Env: DATABASE_URL, FF_DATE (default today PT), FF_STRICT (0 = never exit non-zero, default 1)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg

PT = timezone(timedelta(hours=-8))

# (label, severity, sql, max_age_days, note)   sql returns ONE date/timestamp: the freshest thing stored.
CHECKS = [
    ("injury report snapshots", "BINDING",
     "SELECT max(game_date) FROM nba_daily.injury_report_snapshots", 1,
     "A1/N1/N2/A6/A9 - availability. Fallback: nba_score.availability_p_plays (derived, Brier 0.0441 OOS)"),
    ("board snapshots (any app)", "BINDING",
     "SELECT max(game_date) FROM nba_market.board_snapshots", 1,
     "the decision-moment board; P3 archives it at label 'window'"),
    ("board tiers v2", "BINDING",
     "SELECT max(game_date) FROM nba_market.board_tiers_v2", 1,
     "goblin/standard/demon classification - the pricing and slip engines read it"),
    ("market game lines", "BINDING",
     "SELECT max(game_date) FROM nba_market.game_lines_snapshots", 1,
     "B1/B2 spread and total. Fallback: our derived spread (r=0.46), factor delta -> 0 + penalty"),
    ("rung market", "BINDING",
     "SELECT max(game_date) FROM nba_market.rung_market", 1,
     "de-vigged book probability per rung"),
    ("baseline history", "BINDING",
     "SELECT max(game_date) FROM nba_score.baseline_history", 1, "P2's ladder for the slate"),
    ("final_hp", "BINDING",
     "SELECT max(game_date) FROM nba_score.final_hp", 1, "the headline output; P2 owns it since 2026-09-23"),
    ("board scored", "BINDING",
     "SELECT max(game_date) FROM nba_score.board_scored", 1, "P3's own output"),
    ("referee assignments", "FALLBACK",
     "SELECT max(game_date) FROM nba_ref.referee_assignments", 1,
     "D1 crew. Published only on game morning and never archived -> empty out of season is EXPECTED. "
     "Fallback: factor zero + confidence penalty (crew is tertiary by design)"),
    ("starter status", "FALLBACK",
     "SELECT max(updated_at) FROM nba_stats.player_game_starter_status", 3,
     "A5 lineup change. Fallback: P(start) from starter-status history"),
    ("game officials (truth)", "FALLBACK",
     "SELECT max(updated_at) FROM nba_stats.game_officials", 3, "post-tip truth for the crew tendency table"),
    ("defender ratings", "WEEKLY",
     "SELECT max(as_of_date) FROM nba_ref.defender_ratings", 8, "M1/B4 - refreshed by P1 weekly"),
    ("as-of calibration", "WEEKLY",
     "SELECT max(built_at) FROM nba_score.ladder_calibration_asof", 8, "refit by P2 from graded outcomes"),
    ("availability prior (derived fallback)", "WEEKLY",
     "SELECT max(now()) FROM nba_score.availability_prior WHERE p_plays IS NOT NULL", 9999,
     "the derived P(plays) model itself must EXIST or the fallback has nothing to fall back to"),
]


def main():
    strict = os.environ.get("FF_STRICT", "1") == "1"
    today = os.environ.get("FF_DATE") or datetime.now(PT).date().isoformat()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = '120s'")

    # SEASON GATE. Out of season none of this is due; judging it would train everyone to ignore red builds.
    with conn.cursor() as cur:
        cur.execute("""SELECT count(*) FROM nba_calendar.games
                       WHERE game_date BETWEEN %s::date - 7 AND %s::date""", (today, today))
        recent_games = int(cur.fetchone()[0] or 0)
        cur.execute("SELECT count(*) FROM nba_calendar.games WHERE game_date = %s", (today,))
        games_today = int(cur.fetchone()[0] or 0)
    in_season = recent_games > 0
    print(f"FACTOR FRESHNESS  (date {today} PT)  games today: {games_today}  games in last 7d: {recent_games}"
          f"  -> {'IN SEASON' if in_season else 'OUT OF SEASON - reporting only'}\n", flush=True)
    print(f"  {'factor':<38}{'severity':<10}{'freshest stored':<24}{'age':<8}state", flush=True)

    fails, warns = [], []
    for label, sev, sql, max_age, note in CHECKS:
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                row = cur.fetchone()
            val = row[0] if row else None
        except Exception as exc:  # noqa: BLE001
            print(f"  {label:<38}{sev:<10}{'QUERY ERROR':<24}{'':<8}{str(exc)[:60]}", flush=True)
            (fails if sev == "BINDING" else warns).append(label)
            continue

        if val is None:
            age, state = None, "EMPTY"
        else:
            d = val.date() if hasattr(val, "date") else val
            age = (datetime.fromisoformat(today).date() - d).days
            state = "ok" if age <= max_age else "STALE"

        # Out of season nothing is due; in season a BINDING miss is a red build and a FALLBACK miss is loud.
        judged = in_season and sev in ("BINDING", "FALLBACK", "WEEKLY")
        if judged and state != "ok":
            if sev == "BINDING":
                fails.append(label)
            else:
                warns.append(label)
        print(f"  {label:<38}{sev:<10}{str(val)[:22]:<24}{(str(age) + 'd') if age is not None else '-':<8}"
              f"{state if judged or state == 'ok' else state + ' (not due)'}", flush=True)
        if state != "ok" and sev == "FALLBACK":
            print(f"       -> fallback carries this factor: {note}", flush=True)

    print("", flush=True)
    if warns:
        print(f"FALLBACK ACTIVE (green, but know it): {', '.join(warns)}", flush=True)
    if fails:
        print(f"BINDING FACTORS MISSING OR STALE: {', '.join(fails)}", flush=True)
        if strict:
            print("\nThe slate cannot be scored honestly without these. Failing so it is visible.", flush=True)
            conn.close()
            sys.exit(1)
    if not fails and not warns:
        print("Every factor stored and fresh.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
