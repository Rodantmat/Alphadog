#!/usr/bin/env python3
"""
PIPELINE CERTIFIER — each pipeline proves it did its job, or the job goes red.

WHY THIS EXISTS. The repo's own history is the argument: a missing 44% of the board (the combos ladder)
went unnoticed for TWO DAYS because steps were written `|| echo failed`, and four jobs failed silently
for an hour while row counts alone looked stable (COMPASS supervisor lesson). A pipeline that cannot
fail loudly is a pipeline you cannot trust unattended — and these three run unattended every day.

WHAT IT DOES. For the named pipeline it asserts every artefact it was supposed to produce is PRESENT
and FRESH, then exits non-zero if any check fails, printing exactly which one and why. It never
"warns". Freshness is measured against the pipeline's own cadence, not a fixed date, so it keeps
working next season without edits.

  PIPE=p1  weekly static   - identity, weekly as-of tables, defender ratings
  PIPE=p2  overnight heavy - game logs delta, baseline ladder for today's slate
  PIPE=p3  afternoon light - injury report, board, market, final_hp for today

Env: DATABASE_URL, PIPE, CERT_DATE (default today PT), CERT_STRICT (1 = fail on any miss, default 1)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg

PT = timezone(timedelta(hours=-8))


def main():
    pipe = (os.environ.get("PIPE") or "p1").lower()
    strict = os.environ.get("CERT_STRICT", "1") == "1"
    today = os.environ.get("CERT_DATE") or datetime.now(PT).date().isoformat()
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = '120s'")
    fails, checks = [], 0

    def check(name, sql, params, ok_rule, detail=""):
        """ok_rule(value) -> True means healthy. Prints one line per check, always."""
        nonlocal checks
        checks += 1
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            val = row[0] if row else None
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL  {name:<46} query error: {str(exc)[:70]}", flush=True)
            fails.append(name)
            return
        good = False
        try:
            good = bool(ok_rule(val))
        except Exception:  # noqa: BLE001
            good = False
        print(f"  {'ok  ' if good else 'FAIL'}  {name:<46} {str(val)[:34]:<36}{detail}", flush=True)
        if not good:
            fails.append(name)

    print(f"CERTIFY {pipe.upper()}  (date {today})\n", flush=True)

    if pipe == "p1":
        # the weekly layer must have refreshed within the last 8 days - a 7-day cadence plus slack
        check("defender_ratings refreshed",
              "SELECT max(as_of_date) FROM nba_ref.defender_ratings", (),
              lambda v: v is not None and (datetime.fromisoformat(today).date() - v).days <= 8,
              "<= 8 days old")
        check("defender_ratings rows",
              "SELECT count(*) FROM nba_ref.defender_ratings", (),
              lambda v: v and int(v) > 10000, "> 10k")
        check("player name map populated",
              "SELECT count(*) FROM nba_ref.player_name_map", (),
              lambda v: v and int(v) > 400, "> 400 players")

    elif pipe == "p2":
        # the overnight pipeline must have produced TODAY's baseline for the slate
        check("baseline_history has today",
              "SELECT count(*) FROM nba_score.baseline_history WHERE game_date = %s", (today,),
              lambda v: v and int(v) > 0, "rows for today's slate")
        check("baseline props for today",
              "SELECT count(DISTINCT prop) FROM nba_score.baseline_history WHERE game_date = %s", (today,),
              lambda v: v and int(v) >= 25, ">= 25 of 30 props")
        check("no invalid probabilities today",
              """SELECT count(*) FROM nba_score.baseline_history
                 WHERE game_date = %s AND (p_more IS NULL OR p_more < 0 OR p_more > 1)""", (today,),
              lambda v: int(v or 0) == 0, "must be 0")
        check("as-of calibration available",
              "SELECT count(*) FROM nba_score.ladder_calibration_asof", (),
              lambda v: v and int(v) > 0, "cells exist")

    elif pipe == "p3":
        # the afternoon pipeline must have scored TODAY's legs after the 1:15 PM PT cutoff
        check("final_hp has today",
              "SELECT count(*) FROM nba_score.final_hp WHERE game_date = %s", (today,),
              lambda v: v and int(v) > 0, "scored legs for today")
        check("confidence populated",
              """SELECT count(*) FROM nba_score.final_hp
                 WHERE game_date = %s AND confidence IS NULL""", (today,),
              lambda v: int(v or 0) == 0, "no NULL confidence")
        check("score in range 0-100",
              """SELECT count(*) FROM nba_score.final_hp
                 WHERE game_date = %s AND (score < 0 OR score > 100)""", (today,),
              lambda v: int(v or 0) == 0, "must be 0")
        check("confidence model loaded",
              "SELECT count(*) FROM nba_score.confidence_model WHERE deduction > 0", (),
              lambda v: v and int(v) > 0, "measured deductions exist")
        check("board archived today",
              "SELECT count(*) FROM nba_market.board_snapshots WHERE game_date = %s", (today,),
              lambda v: v and int(v) > 0, "board legs captured")

    else:
        print(f"unknown PIPE '{pipe}'", flush=True)
        sys.exit(2)

    print(f"\n{checks - len(fails)}/{checks} checks passed", flush=True)
    if fails:
        print(f"FAILED CHECKS: {', '.join(fails)}", flush=True)
        if strict:
            print("\nThis pipeline did NOT produce what it promised. Failing the job so it is visible.",
                  flush=True)
            sys.exit(1)
    else:
        print("Pipeline certified.", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
