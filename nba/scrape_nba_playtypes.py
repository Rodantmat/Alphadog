#!/usr/bin/env python3
"""
Play-type data (per NBA_ENRICHMENT_FACTORS_RESEARCH.md Section 8, third research pass 2026-09-02):
stats.nba.com's synergyplaytypes - Gemini's top-flagged remaining addition, offensive "role"
data (Isolation, PRBallHandler, PRRollman, Postup, Spotup, Handoff, Cut, Transition, OffScreen,
OffRebound, Misc) at both player and team level, plus team-level DEFENSIVE grouping (what a team
concedes per play type - a sharper version of "defense vs position").
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

STATS_HEADERS = {
    "Host": "stats.nba.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}

PLAY_TYPES = ["Transition", "Isolation", "PRBallHandler", "PRRollman", "Postup", "Spotup",
              "Handoff", "Cut", "OffScreen", "OffRebound", "Misc"]

BASE_URL = "https://stats.nba.com/stats/synergyplaytypes"


import sys
sys.path.insert(0, "nba")
from nba_season import active_stats_season

SEASON = active_stats_season()

# EARLY-SEASON QUALIFICATION (2026-10-30, P1 run 40382775981). The synergyplaytypes endpoint publishes a (player, play type)
# row only once the player has >= QUALIFY_POSS possessions of that play type (measured: min(poss) = 10 in all 11 play types
# of the 3,282-row 2025-26 table, 0 rows below 10; the team level has no floor - min 2). So the record count GROWS with
# games played: 161 at ~3 team games is the endpoint working, not a failure. The old hard-coded 400 was only ever true
# from ~game 8 on. The expected count is now read off a curve measured on the last full season
# (nba/data/nba_playtypes_player_qualify_curve.json: records that clear 10 poss after G team games, availability-adjusted
# lower bound), and the failure floor is FLOOR_FRACTION of it. Real failures stay loud: any fetch error is a failure
# regardless of the count, and an empty/blocked answer (0 records) is far below any floor.
QUALIFY_CURVE_PATH = Path("nba/data/nba_playtypes_player_qualify_curve.json")
FLOOR_FRACTION = 0.5
TEAM_MIN_EXPECTED = 25     # 30 teams x 11 types x off(/def): no endpoint floor, so this is a plain sanity floor


def expected_player_records(team_games, curve_path=QUALIFY_CURVE_PATH):
    """Records expected at `team_games` games played (linear interpolation on the measured curve), or None."""
    if team_games is None:
        return None
    try:
        curve = json.loads(Path(curve_path).read_text())["expected_by_team_games"]
    except Exception:  # noqa: BLE001
        return None
    g = max(1.0, min(float(team_games), float(len(curve))))
    lo = int(g)
    hi = min(lo + 1, len(curve))
    return curve[lo - 1] + (curve[hi - 1] - curve[lo - 1]) * (g - lo)


def min_expected_for(level_name, team_games):
    if level_name == "team":
        return TEAM_MIN_EXPECTED
    exp = expected_player_records(team_games)
    if exp is None:
        # no curve on disk: scale the old full-season floor by the share of the season played (never below 10)
        return max(10, int(400 * min(1.0, (team_games or 82) / 82.0)))
    return max(10, int(exp * FLOOR_FRACTION))


def median_team_games(team_records):
    gps = sorted(float(r["gp"]) for r in team_records if r.get("gp") is not None)
    return None if not gps else gps[len(gps) // 2]


def build_url(player_or_team, play_type, type_grouping):
    return (f"{BASE_URL}?LeagueID=00&PerMode=Totals&PlayType={play_type}&PlayerOrTeam={player_or_team}"
            f"&SeasonType=Regular+Season&SeasonYear={SEASON}&TypeGrouping={type_grouping}")


def fetch_one(url, proxies):
    last_error = None
    for attempt in range(1, 3):
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=30, proxies=proxies, impersonate="chrome124")
            resp.raise_for_status()
            body = resp.json()
            rs = (body.get("resultSets") or [{}])[0]
            headers = rs.get("headers", [])
            idx = {h: i for i, h in enumerate(headers)}
            rows = rs.get("rowSet") or []
            return rows, idx, None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if attempt < 2:
                time.sleep(3)
    return None, None, last_error


def row_to_record(row, idx, player_or_team):
    def col(name):
        i = idx.get(name)
        return row[i] if i is not None and i < len(row) else None

    record = {
        "play_type": col("PLAY_TYPE"),
        "type_grouping": col("TYPE_GROUPING"),
        "gp": col("GP"),
        "poss_pct": col("POSS_PCT"),
        "ppp": col("PPP"),
        "fg_pct": col("FG_PCT"),
        "efg_pct": col("EFG_PCT"),
        "poss": col("POSS"),
        "pts": col("PTS"),
        "percentile": col("PERCENTILE"),
    }
    if player_or_team == "P":
        record["player_id"] = col("PLAYER_ID")
    else:
        record["team_id"] = col("TEAM_ID")
    return record


def scrape_level(player_or_team, proxies):
    all_records = []
    fetch_errors = []
    # First, try the cheap path: PlayType left blank returns every play type in one call.
    url = build_url(player_or_team, "", "offensive" if player_or_team == "P" else "")
    rows, idx, error = fetch_one(url, proxies)
    method = None
    if rows and idx and idx.get("PLAY_TYPE") is not None:
        distinct_types = set(row[idx["PLAY_TYPE"]] for row in rows if idx.get("PLAY_TYPE") is not None)
        if len(distinct_types) > 1:
            method = "single_call_all_playtypes"
            all_records = [row_to_record(r, idx, player_or_team) for r in rows]

    if method is None:
        # Fallback: loop each real play type individually.
        method = "looped_per_playtype"
        all_records = []
        groupings = ["offensive"] if player_or_team == "P" else ["offensive", "defensive"]
        for grouping in groupings:
            for pt in PLAY_TYPES:
                url = build_url(player_or_team, pt, grouping)
                rows, idx, error = fetch_one(url, proxies)
                if rows is None:      # a failed call is NOT an empty play type (the old code treated both the same)
                    fetch_errors.append(f"{grouping}/{pt}: {error}")
                elif rows and idx:
                    all_records.extend(row_to_record(r, idx, player_or_team) for r in rows)
                time.sleep(0.5)

    return all_records, method, fetch_errors


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # TEAM FIRST: its GP column is the games-played clock the player floor is scaled by.
    team_games = None
    # OWNER DECISION (default 0 = off): below this many team games keep the previous (prior-season) file instead of
    # replacing a full-season profile with a few games. NBA_ENRICHMENT_MINING_AND_FALLBACKS.md section 9, M2: "Synergy play
    # types have no date filter -> use the previous season's table for a given season (parity-safe)".
    defer_below = float(os.environ.get("PLAYTYPES_MIN_TEAM_GAMES", "0") or 0)
    for level_name, code, key_field in [("team", "T", "team_id"), ("player", "P", "player_id")]:
        output_path = Path(f"nba/data/nba_playtypes_{level_name}_current.json")
        meta_path = Path(f"nba/data/nba_playtypes_{level_name}_current_meta.json")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        error = None
        records = []
        method = None
        fetch_errors = []
        status = "ok"
        min_expected = None
        try:
            records, method, fetch_errors = scrape_level(code, proxies)
            real_records = [r for r in records if r.get(key_field)]
            if level_name == "team":
                team_games = median_team_games(real_records)
            min_expected = min_expected_for(level_name, team_games)
            if fetch_errors:
                error = f"fetch_failed: {len(fetch_errors)} call(s) failed, first: {fetch_errors[0]}"
            elif len(real_records) < min_expected:
                error = (f"suspiciously_low: {len(real_records)} records via {method}, expected {min_expected}+ "
                         f"at {team_games} team games")
            records = real_records
        except Exception as exc:  # noqa: BLE001
            error = str(exc)
        if error:
            status = "failed"
        elif defer_below and (team_games is None or team_games < defer_below):
            status = "deferred_prior_season"      # scraped fine, deliberately NOT written: the prior-season file stays

        # NEVER REPLACE A GOOD FILE WITH A FAILED ONE (2026-10-07, full-system certification pass G): written only when the
        # level scraped cleanly; on error the meta records it, the exit code is 1 and the previous file stays in place.
        if status == "ok":
            output_path.write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")
        meta_path.write_text(json.dumps({
            "fetched_at": fetched_at,
            "level": level_name,
            "season": SEASON,
            "method_used": method,
            "record_count": len(records),
            "team_games": team_games,
            "min_expected": min_expected,
            "status": status,
            "error": error,
        }, indent=2), encoding="utf-8")

        if error:
            print(f"NBA playtypes ({level_name}) scrape FAILED/WARN: {error}", file=sys.stderr)
        elif status != "ok":
            print(f"NBA playtypes ({level_name}) scraped {len(records)} records at {team_games} team games - {status}: file NOT replaced")
        else:
            print(f"NBA playtypes ({level_name}) scrape OK: {len(records)} records via {method}")

    # Overall exit code reflects whether EITHER level failed - both are checked, neither silently skipped.
    player_meta = json.loads(Path("nba/data/nba_playtypes_player_current_meta.json").read_text())
    team_meta = json.loads(Path("nba/data/nba_playtypes_team_current_meta.json").read_text())
    if player_meta.get("error") or team_meta.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
