"""
nba_season.py - the ONE shared season-detection utility for every NBA scraper.

Real bug this fixes (found 2026-09-07 during a brainstorm about the delta path): every weekly
static scraper hardcoded Season=2025-26 directly in its URLs or a SEASON constant (confirmed on
6 scrapers directly - splits, lineups, player-bio, tracking-detail, playtypes, shotquality - and
the pattern is universal across the whole stats.nba.com scraper set, all written from the same
template). On 2026-10-03 when the 2026-27 season starts, the entire weekly layer would have
silently kept pulling the frozen 2025-26 season's data while reporting success on every run -
the most dangerous kind of failure, because nothing errors.

Only scrape_nba_daily_delta.py auto-detected the season. This module lifts that logic out so
every scraper shares it, and adds an explicit NBA_SEASON env-var override for one-off historical
runs (e.g. re-running a backfill for a specific past season).

NBA seasons run Oct-June. A date in Jul-Sep counts toward the UPCOMING season (off-season
prep), matching how stats.nba.com itself rolls the "current season" over in the summer.
"""
import os
from datetime import date


def current_season(today=None):
    override = os.environ.get("NBA_SEASON", "").strip()
    if override:
        return override
    today = today or date.today()
    start_year = today.year if today.month >= 7 else today.year - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def active_stats_season(today=None):
    """The season that actually HAS game data right now - distinct from current_season().

    Real design subtlety surfaced while applying the utility (2026-09-07): in Jul-Sep the
    "current" season is the UPCOMING one (correct for roster/schedule purposes), but it has zero
    games played. If the weekly STATS scrapers (tracking, splits, lineups, shot quality, on/off,
    play types, team stats) queried it, they'd get empty or zero-valued rows - and for tables keyed
    by player_id alone, that could overwrite last season's real stats with zeros. So stats
    scrapers use THIS: the most recent season with real games - i.e. the prior completed season
    during the off-season, rolling over to the new season only once it starts in October.

    Roster/schedule scrapers (players, teams, schedule) should keep using current_season().
    """
    override = os.environ.get("NBA_SEASON", "").strip()
    if override:
        return override
    today = today or date.today()
    # Jul, Aug, Sep = off-season: the season with real game data is still the prior one.
    if today.month in (7, 8, 9):
        start_year = today.year - 1
    else:
        start_year = today.year if today.month >= 10 else today.year - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def prior_seasons(n, today=None, base=None):
    """The n seasons before `base` (default: current_season()), most recent first."""
    cur = base or current_season(today)
    start_year = int(cur.split("-")[0])
    return [f"{y}-{str(y + 1)[2:]}" for y in range(start_year - 1, start_year - 1 - n, -1)]


def stats_seasons(n, today=None):
    """The n most recent seasons that have real game data, most recent first - anchored on
    active_stats_season, NOT current_season. Real bug this fixes (2026-09-08): building the
    list as [active_stats_season()] + prior_seasons(2) produced ['2025-26','2025-26','2024-25']
    in the off-season (duplicate, and 2023-24 silently missing), because prior_seasons counted
    back from current_season (2026-27) while the anchor was active_stats_season (2025-26)."""
    active = active_stats_season(today)
    return [active] + prior_seasons(n - 1, today, base=active)


if __name__ == "__main__":
    print("current_season (roster/schedule):", current_season())
    print("active_stats_season (has game data):", active_stats_season())
    print("prior 2:", prior_seasons(2))
