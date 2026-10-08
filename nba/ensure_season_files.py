#!/usr/bin/env python3
"""
ENSURE THE CURRENT SEASON'S INPUT FILES EXIST (empty) BEFORE A LADDER BUILD  (2026-10-08, full-system certification round 2).

Why. The ladder builders (nba/baseline/build_baseline_ladder.py, build_combos_ladder.py, build_periods_ladder.py) decide the
CURRENT season from the files on disk: `TEST = _cur if _cur in _all else _all[-1]`. The 2026-27 game-log files are first written
by P2A's delta sync on the morning AFTER the first regular-season game (10-21). So on OPENING NIGHT (10-20) the builder would
have labelled the slate "2025-26": the recipe's return-ramp logic (classification_ladder_v12: games_missed within the SAME
season label) would have counted the April -> October gap as missed games and applied the 0.72-0.87 minutes haircut to every
player who sat his team's last 3+ games of 2025-26; n_prior and the rolling priors would have continued from April instead of
resetting. Every certified-history opener had its season file present (zero rows before the as-of date) - that is the
parity state (COMPASS fact 58). An EMPTY current-season file reproduces it exactly: zero rows, correct label.

What it does. For the season containing BT_ASOF (default today, Pacific), create every season-keyed input the recipes read -
only if the file is ABSENT (a real file is never touched): player log, team log, player/team advanced logs, four factors,
scoring, and the four quarter logs. Shape = the delta sync's ({"meta": {...}, "records": []}). Runs in the runner's checkout
AFTER P2B's input commit, so placeholders are never committed; the daily sync overwrites them with real rows from 10-21.

Env: BT_ASOF (YYYY-MM-DD, default today in America/Los_Angeles).
"""
import datetime as dt
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path("nba/data")


def season_of(d):
    y = d.year if d.month >= 10 else d.year - 1
    return f"{y}-{str(y + 1)[-2:]}"


def main():
    asof = dt.date.fromisoformat(os.environ["BT_ASOF"]) if os.environ.get("BT_ASOF") else dt.datetime.now(ZoneInfo("America/Los_Angeles")).date()
    season = season_of(asof)
    slug = season.replace("-", "_")
    names = [f"nba_player_game_log_{slug}.json", f"nba_team_game_log_{slug}.json",
             f"nba_player_game_log_advanced_{slug}.json", f"nba_team_game_log_advanced_{slug}.json",
             f"nba_backfill_team_four_factors_{slug}.json", f"nba_backfill_team_scoring_{slug}.json"]
    names += [f"nba_player_game_log_q{q}_{slug}.json" for q in (1, 2, 3, 4)]
    DATA.mkdir(parents=True, exist_ok=True)
    created = []
    for n in names:
        p = DATA / n
        if p.exists():
            continue
        p.write_text(json.dumps({"meta": {"season": season, "placeholder": True, "row_count": 0,
                                           "note": "empty current-season input created by ensure_season_files.py for the ladder build; the delta sync replaces it"},
                                  "records": []}))
        created.append(n)
    print(f"ensure_season_files: season {season} (as-of {asof}) - created {len(created)} empty placeholder(s)"
          + (": " + ", ".join(created) if created else "; every season file already present"), flush=True)


if __name__ == "__main__":
    main()
