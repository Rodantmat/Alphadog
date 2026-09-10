#!/usr/bin/env python3
"""
Season tables for the matchup / hustle / clutch factor family + preseason logs (enrichment mining build #2).

All bulk (one call per season per table), all stats.nba.com, run from GitHub Actions with curl_cffi (nba.com blocks
Cloudflare egress). Outputs one file per (table, season) under nba/data/ ({"meta":..., "records":[...]}), slim columns
(no *_RANK), keeping every file far under GitHub's 100 MB limit.

Tables:
  matchups        leagueseasonmatchups  - offense player x defense player: MATCHUP_MIN, PARTIAL_POSS, PLAYER_PTS,
                                          TEAM_PTS, MATCHUP_AST/TOV/BLK, MATCHUP_FGM/FGA/FG3M/FG3A, HELP_*, MATCHUP_FTM/FTA, SFL
  pt_defend       leaguedashptdefend    - per defender: D_FGM/D_FGA/D_FG_PCT, NORMAL_FG_PCT, PCT_PLUSMINUS (defended FG% delta)
  hustle          leaguehustlestatsplayer - CONTESTED_SHOTS, DEFLECTIONS, CHARGES_DRAWN, SCREEN_ASSISTS, LOOSE_BALLS, BOX_OUTS
  clutch          leaguedashplayerclutch  - clutch (last 5 min, +/-5) per-player FGA/FTA/PTS/MIN (ClutchTime=Last 5 Minutes)
  preseason_logs  playergamelogs SeasonType=Pre Season - the opening prior for rookies / new arrivals

Env: SEASONS_N (default 3), TABLES (comma list, default all), PROXY_URL.
Schema discipline (same as every other NBA scraper): real headers are recorded in meta.source_headers and any keep-column
not present is listed in meta.missing_keep_columns; nothing is assumed from docs. Exit 2 if any table came back empty.
"""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import stats_seasons

STATS_HEADERS = {
    "Host": "stats.nba.com", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive", "Referer": "https://stats.nba.com/",
    "x-nba-stats-origin": "stats", "x-nba-stats-token": "true",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
}
OUT = Path("nba/data")
COMMON = "LeagueID=00&PerMode=Totals&SeasonType=Regular+Season&Season={season}"

TABLES = {
    "matchups": {"endpoint": "leagueseasonmatchups", "rs": "SeasonMatchups",
                 "qs": "DefPlayerID=&DefTeamID=&OffPlayerID=&OffTeamID=&" + COMMON,
                 "keep": ["SEASON_ID", "OFF_PLAYER_ID", "DEF_PLAYER_ID", "GP", "MATCHUP_MIN", "PARTIAL_POSS", "PLAYER_PTS", "TEAM_PTS", "MATCHUP_AST", "MATCHUP_TOV", "MATCHUP_BLK", "MATCHUP_FGM", "MATCHUP_FGA", "MATCHUP_FG3M", "MATCHUP_FG3A", "HELP_BLK", "HELP_FGM", "HELP_FGA", "MATCHUP_FTM", "MATCHUP_FTA", "SFL"]},
    "pt_defend": {"endpoint": "leaguedashptdefend", "rs": "LeagueDashPTDefend",
                  "qs": "College=&Conference=&Country=&DateFrom=&DateTo=&DefenseCategory=Overall&Division=&DraftPick=&DraftYear=&GameSegment=&Height=&LastNGames=0&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerExperience=&PlayerID=&PlayerPosition=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=&" + COMMON.replace("PerMode=Totals", "PerMode=PerGame"),
                  "keep": ["CLOSE_DEF_PERSON_ID", "PLAYER_LAST_TEAM_ID", "PLAYER_POSITION", "AGE", "GP", "G", "FREQ", "D_FGM", "D_FGA", "D_FG_PCT", "NORMAL_FG_PCT", "PCT_PLUSMINUS"]},
    "hustle": {"endpoint": "leaguehustlestatsplayer", "rs": "HustleStatsPlayer",
               "qs": "College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PlayerExperience=&PlayerPosition=&SeasonSegment=&TeamID=0&VsConference=&VsDivision=&Weight=&" + COMMON,
               "keep": ["PLAYER_ID", "TEAM_ID", "AGE", "G", "MIN", "CONTESTED_SHOTS", "CONTESTED_SHOTS_2PT", "CONTESTED_SHOTS_3PT", "DEFLECTIONS", "CHARGES_DRAWN", "SCREEN_ASSISTS", "SCREEN_AST_PTS", "OFF_LOOSE_BALLS_RECOVERED", "DEF_LOOSE_BALLS_RECOVERED", "LOOSE_BALLS_RECOVERED", "OFF_BOXOUTS", "DEF_BOXOUTS", "BOX_OUTS"]},
    "clutch": {"endpoint": "leaguedashplayerclutch", "rs": "LeagueDashPlayerClutch",
               "qs": "AheadBehind=Ahead+or+Behind&ClutchTime=Last+5+Minutes&College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&LastNGames=0&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&PointDiff=5&Rank=N&SeasonSegment=&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=&" + COMMON,
               "keep": ["PLAYER_ID", "TEAM_ID", "AGE", "GP", "MIN", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PF", "PTS", "PLUS_MINUS"]},
    "preseason_logs": {"endpoint": "playergamelogs", "rs": "PlayerGameLogs",
                       "qs": "DateFrom=&DateTo=&GameSegment=&LastNGames=0&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&SeasonSegment=&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&" + COMMON.replace("Regular+Season", "Pre+Season"),
                       "keep": ["PLAYER_ID", "TEAM_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "MIN", "PTS", "REB", "AST", "FG3M", "FG3A", "FGA", "FGM", "FTM", "FTA", "STL", "BLK", "TOV", "PF", "PFD", "BLKA"]},
}


def fetch(session, table, season):
    t = TABLES[table]
    url = f"https://stats.nba.com/stats/{t['endpoint']}?" + t["qs"].format(season=season)
    for attempt in range(4):
        try:
            r = session.get(url, headers=STATS_HEADERS, timeout=90, impersonate="chrome124")
            r.raise_for_status()
            body = r.json()
            rs = next((x for x in body.get("resultSets") or [] if x.get("name") == t["rs"]), None)
            if rs is None:
                raise RuntimeError(f"result set {t['rs']} missing; names={[x.get('name') for x in body.get('resultSets') or []]}")
            hdr = rs.get("headers", []); rows = rs.get("rowSet") or []
            idx = [hdr.index(c) for c in t["keep"] if c in hdr]; cols = [hdr[i] for i in idx]
            missing = [c for c in t["keep"] if c not in hdr]
            return [dict(zip(cols, [row[i] for i in idx])) for row in rows], hdr, missing
        except Exception as exc:  # noqa: BLE001
            print(f"  attempt {attempt + 1} failed {table} {season}: {exc}"); time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {table} {season}")


def asof_weekly(session, table, season, season_start, season_end, step_days=7):
    """PARITY MODE: weekly as-of snapshots (DateTo = each week end) for date-filterable tables, so the historical
    simulation sees exactly what the daily season-to-date pull sees (at weekly resolution)."""
    from datetime import date, timedelta
    t = TABLES[table]
    assert "DateTo=" in t["qs"], f"{table} has no DateTo - use the per-game scraper for parity"
    d = date.fromisoformat(season_start) + timedelta(days=step_days); end = date.fromisoformat(season_end)
    snaps = []
    while d <= end + timedelta(days=step_days):
        qs = t["qs"].format(season=season).replace("DateTo=", f"DateTo={min(d, end).strftime('%m/%d/%Y')}")
        url = f"https://stats.nba.com/stats/{t['endpoint']}?" + qs
        recs = None
        for attempt in range(4):
            try:
                r = session.get(url, headers=STATS_HEADERS, timeout=90, impersonate="chrome124"); r.raise_for_status()
                rs = next((x for x in r.json().get("resultSets") or [] if x.get("name") == t["rs"]), None)
                hdr = rs.get("headers", []); rows = rs.get("rowSet") or []
                idx = [hdr.index(c) for c in t["keep"] if c in hdr]; cols = [hdr[i] for i in idx]
                recs = [dict(zip(cols, [row[i] for i in idx])) for row in rows]; break
            except Exception as exc:  # noqa: BLE001
                print(f"  attempt {attempt + 1} failed {table} {season} asof {d}: {exc}"); time.sleep(5 * (attempt + 1))
        snaps.append({"asof": min(d, end).isoformat(), "row_count": len(recs or []), "records": recs or []})
        print(f"  {table} {season} asof {min(d, end)}: {len(recs or [])} rows"); time.sleep(1.5)
        d += timedelta(days=step_days)
    return snaps


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    session = requests.Session(proxies={"https": proxy_url, "http": proxy_url} if proxy_url else None)
    seasons = stats_seasons(int(os.environ.get("SEASONS_N", "3")))
    tables = [x for x in os.environ.get("TABLES", ",".join(TABLES)).split(",") if x and (x in TABLES or x in ("all_players", "coaches"))]
    summary = {}
    if "all_players" in tables:
        # PLAYER INDEX (every player, all seasons): the name -> id join for the injury report (names are "Last, First").
        url = f"https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season={seasons[0]}"
        r = session.get(url, headers=STATS_HEADERS, timeout=90, impersonate="chrome124"); r.raise_for_status()
        rs = next(x for x in r.json()["resultSets"] if x["name"] == "CommonAllPlayers"); hdr = rs["headers"]
        keep = ["PERSON_ID", "DISPLAY_LAST_COMMA_FIRST", "DISPLAY_FIRST_LAST", "ROSTERSTATUS", "FROM_YEAR", "TO_YEAR", "TEAM_ID", "TEAM_ABBREVIATION"]
        idx = [hdr.index(c) for c in keep if c in hdr]; cols = [hdr[i] for i in idx]
        recs = [dict(zip(cols, [row[i] for i in idx])) for row in rs["rowSet"]]
        (OUT / "nba_all_players.json").write_text(json.dumps({"meta": {"endpoint": "commonallplayers", "all_seasons": True, "row_count": len(recs), "source_headers": hdr}, "records": recs}))
        print("all_players:", len(recs)); tables = [t for t in tables if t != "all_players"]
    if "coaches" in tables:
        # COACHES per team per season (commonteamroster 'Coaches' result set; historical seasons supported) -> K1 coach
        # rotation profile keyed by coach. In-season changes are overlaid from nba/data/nba_coach_changes.json (dates).
        team_ids = sorted({int(r_["TEAM_ID"]) for r_ in json.loads((OUT / "nba_all_players.json").read_text())["records"] if r_.get("TEAM_ID")}) if (OUT / "nba_all_players.json").exists() else []
        if not team_ids:
            team_ids = [1610612737, 1610612738, 1610612739, 1610612740, 1610612741, 1610612742, 1610612743, 1610612744, 1610612745, 1610612746, 1610612747, 1610612748, 1610612749, 1610612750, 1610612751, 1610612752, 1610612753, 1610612754, 1610612755, 1610612756, 1610612757, 1610612758, 1610612759, 1610612760, 1610612761, 1610612762, 1610612763, 1610612764, 1610612765, 1610612766]
        team_ids = [t for t in team_ids if 1610612737 <= t <= 1610612766]
        for season in seasons:
            recs = []
            for tid in team_ids:
                url = f"https://stats.nba.com/stats/commonteamroster?LeagueID=00&Season={season}&TeamID={tid}"
                try:
                    r = session.get(url, headers=STATS_HEADERS, timeout=60, impersonate="chrome124"); r.raise_for_status()
                    rs = next(x for x in r.json()["resultSets"] if x["name"] == "Coaches"); hdr = rs["headers"]
                    for row in rs["rowSet"]:
                        d_ = dict(zip(hdr, row)); recs.append({"TEAM_ID": tid, "SEASON": season, "COACH_ID": d_.get("COACH_ID"), "COACH_NAME": d_.get("COACH_NAME"), "COACH_TYPE": d_.get("COACH_TYPE"), "IS_ASSISTANT": d_.get("IS_ASSISTANT"), "SORT_SEQUENCE": d_.get("SORT_SEQUENCE")})
                except Exception as exc:  # noqa: BLE001
                    print(f"  coaches {season} team {tid} failed: {exc}")
                time.sleep(0.8)
            (OUT / f"nba_coaches_{season.replace('-', '_')}.json").write_text(json.dumps({"meta": {"season": season, "endpoint": "commonteamroster/Coaches", "row_count": len(recs)}, "records": recs}))
            print(f"coaches {season}: {len(recs)} rows, head coaches: {sum(1 for x in recs if str(x.get('COACH_TYPE', '')).lower().startswith('head'))}")
        tables = [t for t in tables if t != "coaches"]
    if os.environ.get("MODE", "season") == "asof_weekly":
        WINDOWS = {"2023-24": ("2023-10-24", "2024-04-14"), "2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
        for season in seasons:
            slug = season.replace("-", "_"); w = WINDOWS.get(season)
            if not w: print("no window for", season); continue
            for table in tables:
                if "DateTo=" not in TABLES[table]["qs"]: print(f"skip {table} (no DateTo; per-game scraper covers it)"); continue
                snaps = asof_weekly(session, table, season, w[0], w[1])
                path = OUT / f"nba_{table}_asof_{slug}.json"
                path.write_text(json.dumps({"meta": {"season": season, "table": table, "mode": "asof_weekly", "window": w, "snapshots": len(snaps)}, "snapshots": snaps}))
                summary[f"{table}_asof_{season}"] = {"snapshots": len(snaps), "mb": round(path.stat().st_size / 1e6, 2)}
        (OUT / "nba_season_tables_asof_summary.json").write_text(json.dumps({"seasons": seasons, "summary": summary}, indent=2)); return
    for season in seasons:
        slug = season.replace("-", "_")
        for table in tables:
            recs, hdr, missing = fetch(session, table, season)
            path = OUT / f"nba_{table}_{slug}.json"
            path.write_text(json.dumps({"meta": {"season": season, "table": table, "endpoint": TABLES[table]["endpoint"], "row_count": len(recs), "source_headers": hdr, "missing_keep_columns": missing}, "records": recs}))
            summary[f"{table}_{season}"] = {"rows": len(recs), "mb": round(path.stat().st_size / 1e6, 2), "missing": missing}
            print(f"{table} {season}: {len(recs)} rows, {path.stat().st_size / 1e6:.1f} MB, missing={missing}")
            time.sleep(2.0)
    (OUT / "nba_season_tables_summary.json").write_text(json.dumps({"seasons": seasons, "summary": summary}, indent=2))
    empty = [k for k, v in summary.items() if v["rows"] == 0]
    if empty:
        print("WARNING: empty tables:", empty); sys.exit(2)


if __name__ == "__main__":
    main()
