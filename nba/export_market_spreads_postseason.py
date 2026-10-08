#!/usr/bin/env python3
"""
POSTSEASON MARKET SPREADS (strategy §31w P-3, 2026-10-08) - the postseason twin of export_market_spreads.py.

Games come from the postseason team logs (nba_team.team_game_log_postseason: the home row is the one whose MATCHUP reads
'XXX vs. YYY'), lines from nba_market.game_lines_snapshots (morning 08:00 PT, window), matched on date + both team nicknames.
Writes nba/data/nba_market_spreads_postseason_<slug>.json in the regular file's shape {meta, rows:[game_id, game_date,
home_spread, total, home_spread_window]} - read only by the postseason baseline builder.
Env: DATABASE_URL, MS_SEASONS (default 2024-25,2025-26).
"""
import json
import os
from pathlib import Path

import psycopg

OUT = Path("nba/data")


def main():
    seasons = [s.strip() for s in os.environ.get("MS_SEASONS", "2024-25,2025-26").split(",") if s.strip()]
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    for season in seasons:
        rows = conn.execute("""
            WITH g AS (
              SELECT t.game_id, t.game_date::date AS game_date, split_part(t.matchup, ' ', 1) AS home_tri, split_part(t.matchup, ' ', 3) AS away_tri
              FROM nba_team.team_game_log_postseason t WHERE t.season = %s AND t.matchup LIKE '%% vs. %%'),
            gn AS (
              SELECT g.*, th.nickname AS home_nick, ta.nickname AS away_nick FROM g
              JOIN nba_ref.teams th ON th.abbreviation = g.home_tri JOIN nba_ref.teams ta ON ta.abbreviation = g.away_tri),
            ev AS (
              SELECT DISTINCT gn.game_id, s.event_id FROM gn
              JOIN nba_market.game_lines_snapshots s ON s.game_date = gn.game_date AND s.snapshot_label IN ('morning','window')
               AND lower(s.home_team) LIKE '%%' || lower(gn.home_nick) AND lower(s.away_team) LIKE '%%' || lower(gn.away_nick))
            SELECT ev.game_id, gn.game_date::text,
                   max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team AND s.snapshot_label='morning' THEN s.point END),
                   avg(CASE WHEN s.market='totals' AND s.outcome='Over' AND s.snapshot_label='morning' THEN s.point END),
                   max(CASE WHEN s.market='spreads' AND s.outcome=s.home_team AND s.snapshot_label='window' THEN s.point END),
                   count(DISTINCT gn.game_id) OVER () AS n
            FROM ev JOIN gn ON gn.game_id = ev.game_id
            JOIN nba_market.game_lines_snapshots s ON s.event_id = ev.event_id AND s.game_date = gn.game_date
            GROUP BY 1, 2""", (season,)).fetchall()
        games = conn.execute("SELECT count(DISTINCT game_id) FROM nba_team.team_game_log_postseason WHERE season = %s", (season,)).fetchone()[0]
        recs = [{"game_id": str(r[0]), "game_date": r[1], "home_spread": float(r[2]) if r[2] is not None else None,
                 "total": float(r[3]) if r[3] is not None else None, "home_spread_window": float(r[4]) if r[4] is not None else None}
                for r in rows]
        p = OUT / f"nba_market_spreads_postseason_{season.replace('-', '_')}.json"
        p.write_text(json.dumps({"meta": {"season": season, "postseason": True, "games_in_logs": games, "games": len(recs),
                                          "with_spread": sum(1 for r in recs if r["home_spread"] is not None),
                                          "source": "nba_market.game_lines_snapshots morning + window, matched to the postseason team logs"},
                                 "rows": recs}, separators=(",", ":")))
        print(f"{season}: {len(recs)} of {games} postseason games matched, {sum(1 for r in recs if r['home_spread'] is not None)} with a morning spread -> {p.name}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
