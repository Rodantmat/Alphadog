#!/usr/bin/env python3
"""
DELTA GAP DETECTOR — a day-by-day delta is only as good as its worst hole.

WHY THIS IS THE CRITICAL CHECK FOR P2. The overnight pipeline is a DELTA: each night it adds the
previous night's games to a cumulative store. That design has one failure mode that matters and it is
silent — if a night is missed (runner outage, NBA stats 403, a rate-limit stall), the store still looks
healthy. Row counts go UP every day either way. Nothing errors. The hole only surfaces weeks later as a
player whose rolling form is wrong, and by then the as-of baseline for every date after the gap is
built on it.

So the delta must be audited against the SCHEDULE, not against itself:

  1. DATE COVERAGE   every date the schedule says had games must appear in the game logs
  2. GAME COVERAGE   every game_id on those dates must be present, not just the date
  3. TEAM COVERAGE   both teams must appear for each game (a half-captured game is a hole)
  4. PLAYER PLAUSIBILITY  each team-game needs a plausible roster count (8+ players dressed);
                     a game with 3 players logged is a truncated pull, not a real box score
  5. FRESHNESS       the most recent completed slate must be present

Exit non-zero on any hole, naming the dates and games, so the pipeline goes RED rather than quietly
carrying a gap forward.

Env: DATABASE_URL, GAP_SEASON, GAP_FROM, GAP_TO (defaults: current season, full range)
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"


def fetch(name, timeout=180):
    with urllib.request.urlopen(urllib.request.Request(RAW + name, headers={"User-Agent": "alphadog"}),
                                timeout=timeout) as r:
        return json.load(r)


def main():
    season = os.environ.get("GAP_SEASON", "2025-26")
    slug = season.replace("-", "_")
    d_from = os.environ.get("GAP_FROM") or ""
    d_to = os.environ.get("GAP_TO") or ""

    # --- the SCHEDULE is the source of truth for what should exist -----------------------------
    try:
        sched = fetch("nba_schedule_current.json")
        srows = sched.get("records") or sched.get("rows") or []
    except Exception as exc:  # noqa: BLE001
        print(f"ABORT: cannot read the schedule ({str(exc)[:70]}) - nothing to audit against")
        sys.exit(2)

    expected = defaultdict(set)          # game_date -> {game_id}
    exp_teams = defaultdict(set)         # game_id -> {team}
    for r in srows:
        gd = str(r.get("GAME_DATE") or r.get("game_date") or "")[:10]
        gid = str(r.get("GAME_ID") or r.get("game_id") or "")
        status = str(r.get("STATUS") or r.get("status") or "").lower()
        if not gd or not gid:
            continue
        if d_from and gd < d_from:
            continue
        if d_to and gd > d_to:
            continue
        if "final" not in status:        # only completed games can be in the logs
            continue
        expected[gd].add(gid)
        for k in ("HOME_TEAM_ABBREVIATION", "VISITOR_TEAM_ABBREVIATION", "home_team", "away_team"):
            if r.get(k):
                exp_teams[gid].add(str(r[k])[:3].upper())

    if not expected:
        print(f"No COMPLETED games in the schedule for {season} in range "
              f"[{d_from or 'start'} .. {d_to or 'end'}].")
        print("Nothing to audit - this is EXPECTED in the off-season. Not a failure.")
        sys.exit(0)

    # --- what the delta actually holds ---------------------------------------------------------
    logs = fetch(f"nba_player_game_log_{slug}.json")["records"]
    have_games = defaultdict(set)        # date -> {game_id}
    game_teams = defaultdict(set)        # game_id -> {team}
    game_players = defaultdict(lambda: defaultdict(int))   # game_id -> team -> player count
    for r in logs:
        gd = str(r.get("GAME_DATE"))[:10]
        gid = str(r.get("GAME_ID"))
        team = str(r.get("MATCHUP", "")).split(" ")[0][:3].upper()
        have_games[gd].add(gid)
        game_teams[gid].add(team)
        game_players[gid][team] += 1

    print(f"DELTA GAP AUDIT — {season}   schedule says {sum(len(v) for v in expected.values()):,} "
          f"completed games over {len(expected)} dates\n", flush=True)

    holes = []

    # 1 + 2) missing dates and games
    missing_dates, missing_games = [], []
    for gd, gids in sorted(expected.items()):
        if gd not in have_games:
            missing_dates.append(gd)
            continue
        miss = gids - have_games[gd]
        if miss:
            missing_games.append((gd, sorted(miss)))
    print(f"  dates with NO game logs at all : {len(missing_dates)}", flush=True)
    for gd in missing_dates[:10]:
        print(f"      {gd}", flush=True)
    print(f"  dates missing SOME games       : {len(missing_games)}", flush=True)
    for gd, miss in missing_games[:10]:
        print(f"      {gd}  missing {len(miss)}: {miss[:4]}", flush=True)
    if missing_dates:
        holes.append(f"{len(missing_dates)} dates absent")
    if missing_games:
        holes.append(f"{len(missing_games)} dates with missing games")

    # 3) half-captured games - only one team present
    one_sided = [g for g, t in game_teams.items() if len(t) < 2]
    print(f"  games with only ONE team logged: {len(one_sided)}", flush=True)
    for g in one_sided[:8]:
        print(f"      {g}  teams={sorted(game_teams[g])}", flush=True)
    if one_sided:
        holes.append(f"{len(one_sided)} half-captured games")

    # 4) truncated rosters - a real NBA box score dresses 8+ per side
    thin = []
    for g, teams in game_players.items():
        for t, n in teams.items():
            if n < 8:
                thin.append((g, t, n))
    print(f"  team-games with < 8 players    : {len(thin)}", flush=True)
    for g, t, n in thin[:8]:
        print(f"      {g} {t} only {n} players", flush=True)
    if thin:
        holes.append(f"{len(thin)} truncated team-games")

    # 5) freshness - is the newest completed slate present?
    newest_sched = max(expected)
    newest_have = max(have_games) if have_games else "none"
    fresh = newest_have >= newest_sched
    print(f"\n  newest completed slate in schedule: {newest_sched}", flush=True)
    print(f"  newest slate in the delta         : {newest_have}   {'ok' if fresh else 'STALE'}", flush=True)
    if not fresh:
        holes.append(f"delta stale (newest {newest_have} < {newest_sched})")

    if holes:
        print(f"\nGAPS FOUND: {'; '.join(holes)}")
        print("A delta with holes silently corrupts every as-of value computed after the gap.")
        sys.exit(1)
    print("\nNo gaps. Every completed game, both teams, plausible rosters, up to date.")


if __name__ == "__main__":
    main()
