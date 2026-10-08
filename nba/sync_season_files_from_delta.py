#!/usr/bin/env python3
"""
Daily sync: mirror the current season's DELTA bulk files into the season-named files that the baseline recipe reads
(nba/backtest/*.py and nba/baseline/*.py load nba_player_game_log_<slug>.json etc.). The delta files are full
season-to-date bulk logs with the same record shape, so this is a straight copy with a meta wrapper.
Run after nba/scrape_nba_daily_delta.py in nba-daily-delta.yml.
"""
import json
from pathlib import Path

DATA = Path("nba/data")
meta = json.loads((DATA / "nba_daily_delta_meta.json").read_text())
season = meta["season"]; slug = season.replace("-", "_")
MAP = {
    "nba_delta_player_game_log.json": f"nba_player_game_log_{slug}.json",
    "nba_delta_player_game_log_advanced.json": f"nba_player_game_log_advanced_{slug}.json",
    "nba_delta_team_game_log.json": f"nba_team_game_log_{slug}.json",
    "nba_delta_team_game_log_advanced.json": f"nba_team_game_log_advanced_{slug}.json",
    f"nba_delta_team_four_factors_{slug}.json": f"nba_backfill_team_four_factors_{slug}.json",
    f"nba_delta_team_scoring_{slug}.json": f"nba_backfill_team_scoring_{slug}.json",
}
written = {}
for src, dst in MAP.items():
    p = DATA / src
    if not p.exists():
        print(f"skip {src} (missing)"); continue
    d = json.loads(p.read_text())
    # ROUND-2 P2A#8 (2026-10-08): every delta file carries its own 'season'; a file the scrape could not refresh (left at
    # the previous season on rollover morning) must never be copied under the new season's name. Mismatch = fail loud.
    fs = d.get("season")
    if fs and fs != season:
        raise SystemExit(f"ABORT: {src} is season {fs} but the delta meta says {season} - a stale file must not be synced "
                         f"as {dst} (rollover contamination)")
    recs = d.get("records") or d.get("rows") or []
    if not recs:
        print(f"skip {src} (empty)"); continue
    (DATA / dst).write_text(json.dumps({"meta": {"season": season, "source": src, "synced_from_delta": True, "row_count": len(recs), "fetched_at": meta.get("fetched_at")}, "records": recs}))
    written[dst] = len(recs)
print("synced season files from delta:", season, written)
