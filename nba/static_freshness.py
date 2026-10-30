#!/usr/bin/env python3
"""
SOURCE FRESHNESS GATE for the P1 weekly static layer (2026-10-30, P1 run 40382775981).

WHY. P1 loads each writer worker from the JSON the scraper committed. When a scrape step is skipped or fails, the file in
the checkout is LAST WEEK'S, the worker re-upserts it and answers ok, and updated_at moves - so verify_static_loads.py
(which asks "was the table written after the load started?") calls it LANDED. Measured 2026-10-26: lineups, tracking
detail, DARKO, shot quality and player tracking were reloaded from the 2026-10-19 files, and every *_asof snapshot for
those tables was a byte-identical copy of the previous week (player_tracking_detail_asof 10-19 vs 10-26: 4,652/4,652).

WHAT. Every scraper writes <name>_meta.json with `fetched_at` (UTC, %Y-%m-%dT%H:%M:%SZ) and its own error field. A worker's
source is FRESH only when every meta file it reads has fetched_at >= RUN_STARTED_AT and carries no error. Otherwise the
worker is skipped (it would only re-load old data), its tables are left out of the *_asof snapshot (an identical copy is
noise), and the run says so by name. A deliberate deferral (meta status = deferred_prior_season) is reported as DEFERRED,
not as a failure.

Env: RUN_STARTED_AT (ISO UTC, required), DATA_DIR (default nba/data), FRESH_FAIL=1 (exit 1 when anything is STALE - the
final reporting step), GITHUB_OUTPUT (stale_workers / skip_tables are written when set).
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# worker suffix -> the meta files whose scrape feeds it (workers not listed - nba-weekly-differential - are not gated)
SOURCES = {
    "nba-static-teams": ["nba_teams_current_meta.json"],
    "nba-static-players": ["nba_players_current_meta.json"],
    "nba-static-player-bio": ["nba_player_bio_current_meta.json"],
    "nba-static-team-stats": ["nba_team_stats_current_meta.json"],
    "nba-static-onoff": ["nba_onoff_current_meta.json"],
    "nba-static-playtypes": ["nba_playtypes_player_current_meta.json", "nba_playtypes_team_current_meta.json"],
    "nba-static-tracking-detail": ["nba_tracking_detail_current_meta.json"],
    "nba-static-darko": ["nba_darko_current_meta.json"],
    "nba-static-shotquality": ["nba_shotquality_current_meta.json", "nba_shotquality_delta_current_meta.json", "nba_shotzones_current_meta.json"],
    "nba-static-lineups": ["nba_lineup_profile_meta.json"],
    "nba-static-player-tracking": ["nba_player_tracking_current_meta.json"],
    "nba-static-officials": ["nba_officials_current_meta.json"],
    "nba-static-arenas": ["nba_arenas_current_meta.json"],
}
# worker -> the profile tables the P1 snapshot step copies as-of today (tables with no gated owner are always snapshotted)
TABLES = {
    "nba-static-darko": ["nba_stats.player_impact_rating"],
    "nba-static-playtypes": ["nba_stats.player_playtype_profile", "nba_team.playtype_profile"],
    "nba-static-shotquality": ["nba_stats.player_shot_quality", "nba_stats.player_shot_quality_delta", "nba_stats.player_shot_zone_profile"],
    "nba-static-tracking-detail": ["nba_stats.player_tracking_detail"],
    "nba-static-onoff": ["nba_stats.player_onoff_profile"],
    "nba-static-player-bio": ["nba_stats.player_season_profile"],
    "nba-static-player-tracking": ["nba_stats.player_tracking_profile"],
    "nba-static-team-stats": ["nba_team.season_profile"],
    "nba-static-players": ["nba_ref.players"],
}


def parse(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def meta_problem(m):
    """None when the scrape reported clean, else a short reason."""
    for key in ("error", "errors", "per_team_errors"):
        if m.get(key):
            return f"{key}={str(m[key])[:90]}"
    for name, sub in (m.get("per_type") or {}).items():
        if isinstance(sub, dict) and sub.get("error"):
            return f"per_type[{name}].error={str(sub['error'])[:60]}"
    return None


def judge(data_dir, started):
    """-> {worker: (state, reason)} with state in FRESH / STALE / DEFERRED"""
    out = {}
    for worker, files in SOURCES.items():
        state, reason = "FRESH", ""
        for f in files:
            p = Path(data_dir) / f
            if not p.exists():
                state, reason = "STALE", f"{f} missing"
                break
            try:
                m = json.loads(p.read_text())
                fetched = parse(m["fetched_at"])
            except Exception as exc:  # noqa: BLE001
                state, reason = "STALE", f"{f} unreadable ({str(exc)[:40]})"
                break
            prob = meta_problem(m)
            if prob:
                state, reason = "STALE", f"{f}: scrape error ({prob})"
                break
            if fetched < started:
                state, reason = "STALE", f"{f}: fetched_at {m['fetched_at']} is before this run started {started:%Y-%m-%dT%H:%M:%SZ} (last week's file)"
                break
            if m.get("status") == "deferred_prior_season":
                state, reason = "DEFERRED", f"{f}: scraped but deliberately not written (prior-season profile kept)"
        out[worker] = (state, reason)
    return out


def main():
    started = parse(os.environ["RUN_STARTED_AT"].strip())
    res = judge(os.environ.get("DATA_DIR", "nba/data"), started)
    stale = [w for w, (s, _) in res.items() if s == "STALE"]
    deferred = [w for w, (s, _) in res.items() if s == "DEFERRED"]
    for w, (s, why) in res.items():
        print(f"  {s:<8} {w}{(' - ' + why) if why else ''}")
    skip_tables = [t for w in stale + deferred for t in TABLES.get(w, [])]
    print(f"stale sources (loader + as-of snapshot skipped): {' '.join(stale) or 'none'}")
    print(f"deferred (kept prior-season profile): {' '.join(deferred) or 'none'}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
            fh.write(f"stale_workers={' '.join(stale + deferred)}\n")
            fh.write(f"stale_only={' '.join(stale)}\n")
            fh.write(f"skip_tables={' '.join(skip_tables)}\n")
    if stale:
        print(f"::error::STALE sources (their scrape did not run or failed this run): {' '.join(stale)}")
        if os.environ.get("FRESH_FAIL") == "1":
            sys.exit(1)


if __name__ == "__main__":
    main()
