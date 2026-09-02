#!/usr/bin/env python3
"""
Play-type data (per NBA_ENRICHMENT_FACTORS_RESEARCH.md Section 8, third research pass 2026-09-02):
stats.nba.com's synergyplaytypes - Gemini's top-flagged remaining addition, offensive "role"
data (Isolation, PRBallHandler, PRRollman, Postup, Spotup, Handoff, Cut, Transition, OffScreen,
OffRebound, Misc) at both player and team level, plus team-level DEFENSIVE grouping (what a team
concedes per play type - a sharper version of "defense vs position").

Real uncertainty, tested empirically rather than assumed: PlayType and TypeGrouping are
documented as nullable parameters. If leaving PlayType blank returns all play types in a single
call (cheaper than 11 separate calls), this script uses that; if not, it falls back to looping
over the known real play-type list. Both paths are tried and the working one is recorded in meta
so this doesn't silently guess wrong.

Writes nba/data/nba_playtypes_player_current.json, nba/data/nba_playtypes_team_current.json,
plus _meta.json for each.
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


def build_url(player_or_team, play_type, type_grouping):
    return (f"{BASE_URL}?LeagueID=00&PerMode=Totals&PlayType={play_type}&PlayerOrTeam={player_or_team}"
            f"&SeasonType=Regular+Season&SeasonYear=2025-26&TypeGrouping={type_grouping}")


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
                if rows and idx:
                    all_records.extend(row_to_record(r, idx, player_or_team) for r in rows)
                time.sleep(0.5)

    return all_records, method


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    fetched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for level_name, code, key_field in [("player", "P", "player_id"), ("team", "T", "team_id")]:
        output_path = Path(f"nba/data/nba_playtypes_{level_name}_current.json")
        meta_path = Path(f"nba/data/nba_playtypes_{level_name}_current_meta.json")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        error = None
        records = []
        method = None
        try:
            records, method = scrape_level(code, proxies)
            real_records = [r for r in records if r.get(key_field)]
            min_expected = 400 if level_name == "player" else 25
            if len(real_records) < min_expected:
                error = f"suspiciously_low: {len(real_records)} records via {method}, expected {min_expected}+"
            records = real_records
        except Exception as exc:  # noqa: BLE001
            error = str(exc)

        output_path.write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")
        meta_path.write_text(json.dumps({
            "fetched_at": fetched_at,
            "level": level_name,
            "method_used": method,
            "record_count": len(records),
            "error": error,
        }, indent=2), encoding="utf-8")

        if error:
            print(f"NBA playtypes ({level_name}) scrape FAILED/WARN: {error}", file=sys.stderr)
        else:
            print(f"NBA playtypes ({level_name}) scrape OK: {len(records)} records via {method}")

    # Overall exit code reflects whether EITHER level failed - both are checked, neither silently skipped.
    player_meta = json.loads(Path("nba/data/nba_playtypes_player_current_meta.json").read_text())
    team_meta = json.loads(Path("nba/data/nba_playtypes_team_current_meta.json").read_text())
    if player_meta.get("error") or team_meta.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
