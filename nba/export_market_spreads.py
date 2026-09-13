#!/usr/bin/env python3
"""
EXPORT MARKET SPREADS for the baseline recipe.

The recipe runs on GitHub Actions and reads committed JSON from nba/data/ - it has no database access.
This exports the MORNING snapshot spread and total per game to
    nba/data/nba_market_spreads_<slug>.json
so classification_ladder_v12.py can replace its derived spread (r=0.46, MAE 11.5) with the real line.

AS-OF LEGAL: the morning snapshot is taken at 08:00 PT, before any phase-1 build, so using it on a past
day is a faithful reconstruction, not a leak. The WINDOW snapshot (14:45 PT) is exported alongside for
phase 2, which may refresh p_blowout if the line moved materially.

Env: DATABASE_URL, MS_SEASONS
"""
import json
import os
from pathlib import Path

import psycopg

BOUNDS = {"2023-24": ("2023-10-24", "2024-04-14"),
          "2024-25": ("2024-10-22", "2025-04-13"),
          "2025-26": ("2025-10-21", "2026-04-12")}
OUT = Path("nba/data")


def main():
    seasons = [s.strip() for s in os.environ.get("MS_SEASONS", "2024-25,2025-26").split(",")]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    OUT.mkdir(parents=True, exist_ok=True)
    for season in seasons:
        lo, hi = BOUNDS[season]
        rows = conn.execute("""
            SELECT m.game_id, s.game_date::text,
                   max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team THEN s.point END) AS home_spread,
                   avg(CASE WHEN s.market='totals'  AND s.outcome='Over'      THEN s.point END) AS total,
                   max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team AND s.snapshot_label='window'
                            THEN s.point END) AS home_spread_window
            FROM nba_market.game_lines_snapshots s
            JOIN nba_market.event_game_map m ON m.event_id = s.event_id
            WHERE s.game_date BETWEEN %s AND %s
              AND s.snapshot_label IN ('morning','window')
            GROUP BY 1,2""", (lo, hi)).fetchall()
        recs = [{"game_id": str(r[0]), "game_date": r[1],
                 "home_spread": float(r[2]) if r[2] is not None else None,
                 "total": float(r[3]) if r[3] is not None else None,
                 "home_spread_window": float(r[4]) if r[4] is not None else None} for r in rows]
        with_spread = sum(1 for r in recs if r["home_spread"] is not None)
        p = OUT / f"nba_market_spreads_{season.replace('-', '_')}.json"
        p.write_text(json.dumps({"meta": {"season": season, "games": len(recs),
                                          "with_spread": with_spread,
                                          "source": "nba_market.game_lines_snapshots morning + window",
                                          "as_of": "morning snapshot 08:00 PT - legal for a phase-1 build"},
                                 "rows": recs}, separators=(",", ":")))
        print(f"{season}: {len(recs)} games, {with_spread} with a morning spread -> {p.name}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
