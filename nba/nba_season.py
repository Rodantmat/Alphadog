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


def prior_seasons(n, today=None):
    """The n seasons before the current one, most recent first. e.g. n=2 in 2026-27 -> ['2025-26','2024-25']."""
    cur = current_season(today)
    start_year = int(cur.split("-")[0])
    return [f"{y}-{str(y + 1)[2:]}" for y in range(start_year - 1, start_year - 1 - n, -1)]


if __name__ == "__main__":
    print("current_season:", current_season())
    print("prior 2:", prior_seasons(2))
