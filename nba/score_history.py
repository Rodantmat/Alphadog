#!/usr/bin/env python3
"""
HISTORY SCORER - runs the board scorer (score_board_legs.py) over past dates so the model has a scored history
to compare against PrizePicks' prices (nba/PP_PAYOUT_FINDINGS.md, pending item 1).

POINT-IN-TIME. Each date is scored exactly as P3 would have scored it that afternoon: the P2 ladder built for that
date (nba_score.baseline_history - built only from games strictly before it) and the latest calibration cells
published at or before it (nba_score.ladder_calibration_asof - each fitted from legs strictly before its as-of
date). Nothing from the future enters a date's score.

Dates come from baseline_history (P3 cannot score without P2's ladder), each with ITS OWN season - the scorer
defaults BS_SEASON to 2025-26, so a 2024-25 date scored without it would abort. Each date runs as its own process:
one bad date is reported and skipped, never taking the batch down. Re-running is safe - the scorer replaces a
date whole.

SH_SKIP_BUILT_AFTER (optional timestamp): skip dates already scored after it - resume a partial run without redoing
good dates. Failed dates are retried once at the end of the chunk.

Env: DATABASE_URL, SH_FROM, SH_TO (default = SH_FROM), SH_CHUNK (0-based), SH_CHUNKS (default 1)
"""
import os
import subprocess
import sys
import time

import psycopg


def main():
    lo = os.environ["SH_FROM"]
    hi = os.environ.get("SH_TO") or lo
    chunk, chunks = int(os.environ.get("SH_CHUNK", "0")), int(os.environ.get("SH_CHUNKS", "1"))
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        dates = conn.execute("""
            WITH RECURSIVE d AS (
              (SELECT season, game_date FROM nba_score.baseline_history WHERE game_date >= %s ORDER BY game_date LIMIT 1)
              UNION ALL
              SELECT n.season, n.game_date FROM d,
                LATERAL (SELECT b.season, b.game_date FROM nba_score.baseline_history b
                         WHERE b.game_date > d.game_date ORDER BY b.game_date LIMIT 1) n
              WHERE d.game_date < %s)
            SELECT season, game_date::text FROM d WHERE game_date BETWEEN %s AND %s ORDER BY game_date""",
            (lo, hi, lo, hi)).fetchall()
        since = os.environ.get("SH_SKIP_BUILT_AFTER", "").strip()
        done = set()
        if since:
            done = {r[0] for r in conn.execute("""
                SELECT d::text FROM unnest(%s::date[]) AS d
                WHERE EXISTS (SELECT 1 FROM nba_score.board_scored b WHERE b.game_date = d AND b.built_at > %s)""",
                ([x[1] for x in dates], since)).fetchall()}
    todo = [x for x in dates if x[1] not in done]
    mine = todo[chunk::chunks]
    print(f"PLAN|{len(dates)} ladder dates in {lo}..{hi}|{len(done)} already scored after {since or '-'}"
          f"|chunk {chunk}/{chunks} scores {len(mine)}", flush=True)
    failed, skipped = [], []
    for season, day in mine:
        t0 = time.time()
        env = dict(os.environ, BS_ASOF=day, BS_SEASON=season, BS_SOURCE="archive")
        r = subprocess.run([sys.executable, "nba/score_board_legs.py"], env=env, capture_output=True, text=True)
        secs = time.time() - t0
        out = (r.stdout or "").strip().splitlines()
        scored = next((x.strip() for x in reversed(out) if x.strip().startswith("scored ")), "")
        if r.returncode == 0 and not scored and "No board legs" in (r.stdout or ""):
            skipped.append(day)
            print(f"SKIP|{day}|{season}|{secs:.0f}s|no board legs archived for this date", flush=True)
        elif r.returncode != 0 or not scored:
            failed.append(day)
            tail = " | ".join(((r.stdout or "") + (r.stderr or "")).strip().splitlines()[-4:])
            print(f"FAIL|{day}|{season}|{secs:.0f}s|rc={r.returncode}|{tail}", flush=True)
        else:
            print(f"SCORED|{day}|{season}|{secs:.0f}s|{scored}", flush=True)
    for day in list(failed):                      # one retry for anything transient
        season = next(x[0] for x in mine if x[1] == day)
        env = dict(os.environ, BS_ASOF=day, BS_SEASON=season, BS_SOURCE="archive")
        r = subprocess.run([sys.executable, "nba/score_board_legs.py"], env=env, capture_output=True, text=True)
        scored = next((x.strip() for x in reversed((r.stdout or "").strip().splitlines()) if x.strip().startswith("scored ")), "")
        if r.returncode == 0 and scored:
            failed.remove(day)
            print(f"RETRY_OK|{day}|{season}|{scored}", flush=True)
        else:
            print(f"RETRY_FAIL|{day}|{season}|rc={r.returncode}", flush=True)
    print(f"CHUNK_DONE|chunk {chunk}|scored {len(mine) - len(failed) - len(skipped)}|skipped {len(skipped)}"
          f"|failed {len(failed)}|{failed}", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
