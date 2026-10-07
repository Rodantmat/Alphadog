#!/usr/bin/env python3
"""
NBA PIPELINE RUN-ONCE GUARD (2026-10-02). Owner rule: no pipeline may run twice for the same slate.

Every NBA pipeline (P1 weekly, P2 overnight, P3 afternoon) starts with a `claim` job that calls this script. It writes
one row per (pipeline, run_key) into nba_control.pipeline_runs with an atomic INSERT ... ON CONFLICT DO NOTHING:
the first run to claim a slate proceeds; every later run for the same slate - a duplicate cron fire, a late GitHub
schedule, a watchdog re-dispatch that raced the original - stops at the claim and runs nothing.

  run_key   P2/P3: the slate date (the `asof` input, else today in Pacific time - the same rule the pipelines use)
            P1:    the Monday of the week (Pacific time)
  FORCE     'true' re-claims an already-claimed key (deliberate manual recovery only; recorded in the row's note)

MODE=claim  -> writes proceed=true|false and run_key to $GITHUB_OUTPUT. Fails CLOSED: if the database cannot be reached
               the job errors (every pipeline needs the database anyway; a silent proceed could double-run).
MODE=finish -> records the pipeline's final result (success / failure / cancelled) on the row this run claimed.
"""
import os
import sys
import datetime as dt
from zoneinfo import ZoneInfo

import psycopg

PT = ZoneInfo("America/Los_Angeles")


def run_key(pipeline, asof):
    day = dt.date.fromisoformat(asof) if asof else dt.datetime.now(PT).date()
    if pipeline == "P1":
        day = day - dt.timedelta(days=day.weekday())   # Monday of the week
    return day


def out(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    lines = "".join(f"{k}={v}\n" for k, v in kv.items())
    if path:
        with open(path, "a") as f:
            f.write(lines)
    print(lines, end="")


def main():
    mode = os.environ.get("MODE", "claim")
    pipeline = os.environ["PIPELINE"]
    key = run_key(pipeline, (os.environ.get("IN_ASOF") or "").strip())
    run_id = os.environ.get("RUN_ID", "")
    source = os.environ.get("EVENT", "")
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS nba_control.pipeline_runs (
            pipeline text NOT NULL, run_key date NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(), source text, github_run_id text,
            status text NOT NULL DEFAULT 'claimed', finished_at timestamptz, note text, PRIMARY KEY (pipeline, run_key))""")
        if mode == "finish":
            result = os.environ.get("RESULT", "unknown")
            # SOFT FAILURES (2026-10-07, full-system certification pass G): steps marked continue-on-error (monitors, research
            # captures, isolated re-pricing) never fail the run, so their failures were invisible in nba_control.pipeline_runs.
            # The workflow lists them in SOFT_FAILED; they are appended to the row's note and surfaced as a run warning.
            soft = (os.environ.get("SOFT_FAILED") or "").strip()
            note = f" [soft-failed steps: {soft}]" if soft else ""
            n = c.execute("""UPDATE nba_control.pipeline_runs SET status=%s, finished_at=now(), note=coalesce(note,'') || %s
                             WHERE pipeline=%s AND run_key=%s AND github_run_id=%s""", (result, note, pipeline, key, run_id)).rowcount
            c.commit()
            print(f"{pipeline} {key}: recorded result '{result}' ({n} row){note}")
            if soft:
                print(f"::warning::{pipeline} {key}: steps that failed but did not fail the run: {soft}")
            return
        row = c.execute("""INSERT INTO nba_control.pipeline_runs (pipeline, run_key, source, github_run_id)
                           VALUES (%s,%s,%s,%s) ON CONFLICT (pipeline, run_key) DO NOTHING RETURNING pipeline""",
                        (pipeline, key, source, run_id)).fetchone()
        if row:
            c.commit()
            print(f"CLAIMED {pipeline} {key} (run {run_id}, {source}) - this run proceeds")
            out(proceed="true", run_key=key.isoformat())
            return
        prev = c.execute("""SELECT claimed_at, source, github_run_id, status, finished_at FROM nba_control.pipeline_runs
                            WHERE pipeline=%s AND run_key=%s""", (pipeline, key)).fetchone()
        if (os.environ.get("FORCE") or "").lower() == "true":
            c.execute("""UPDATE nba_control.pipeline_runs SET claimed_at=now(), source=%s, github_run_id=%s, status='claimed', finished_at=NULL,
                         note=coalesce(note,'') || %s WHERE pipeline=%s AND run_key=%s""",
                      (source, run_id, f" [forced over run {prev[2]} ({prev[3]}) at {dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}]", pipeline, key))
            c.commit()
            print(f"FORCED re-claim of {pipeline} {key} over run {prev[2]} ({prev[3]}) - this run proceeds")
            out(proceed="true", run_key=key.isoformat())
            return
        c.commit()
        print(f"::notice::{pipeline} {key} already claimed by run {prev[2]} ({prev[1]}) at {prev[0]}, status {prev[3]}"
              f" - this run does nothing (no pipeline runs twice). Dispatch with force=true only for deliberate recovery.")
        out(proceed="false", run_key=key.isoformat())


if __name__ == "__main__":
    main()
