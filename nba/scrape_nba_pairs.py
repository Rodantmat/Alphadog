#!/usr/bin/env python3
"""
TEAMMATE PAIR SHARED-COURT DATA — the missing layer the redistribution model needs.

WHY THIS EXISTS
  The absence panel v1 and v2 both failed their conservation check (shares summed to 0.10 / -0.05 /
  -0.37 instead of ~1.0). Root cause is not a threshold: a box score says two players APPEARED in the
  same game, not that they were ON THE FLOOR TOGETHER. Redistribution is a floor-sharing phenomenon,
  so the "with" baseline has to be measured on shared possessions. The matchup shards do carry
  percentageTotalTimeBothOn, but that is offense-vs-DEFENDER (opposing players), not teammates.

SOURCE
  stats.nba.com `leaguedashlineups` with GroupQuantity=2 returns every two-man teammate combination
  with MIN, POSS-equivalents and box-score totals for the group. With DateFrom/DateTo it becomes an
  AS-OF table, which is what the parity rule requires (nba/nba_asof.py): a pair baseline for a game on
  date D must use only data strictly before D.

WHAT IT PRODUCES
  nba/data/nba_pairs_<slug>_<YYYY-MM-DD>.json  — one weekly as-of snapshot per season, columnar
  {"meta": {...}, "columns": [...], "rows": [...]}
  keyed by (GROUP_ID = "pid1-pid2", TEAM_ID) with MIN together, and the pair's on-floor production.

HOW THE PANEL USES IT
  with_min(P | X) and with_poss(P | X) become P's rates in the MINUTES THE PAIR SHARED, as of the game
  date — so an absence is measured against the state that actually changed, and the vacated minutes
  have somewhere to land. Shares can then be expected to sum toward 1.

Env: PAIRS_SEASONS="2024-25,2025-26", PAIRS_EVERY_DAYS=7, PROXY_URL
"""
import json
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from curl_cffi import requests

OUT = Path("nba/data")
BASE = "https://stats.nba.com/stats/leaguedashlineups"
HDR = {
    "Host": "stats.nba.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
BOUNDS = {"2024-25": ("2024-10-22", "2025-04-13"), "2025-26": ("2025-10-21", "2026-04-12")}
KEEP = ["GROUP_ID", "GROUP_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GP", "MIN",
        "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PTS", "PLUS_MINUS"]


def get(season, date_to, proxies):
    params = {
        "GroupQuantity": "2", "Season": season, "SeasonType": "Regular Season", "MeasureType": "Base",
        "PerMode": "Totals", "LastNGames": "0", "Month": "0", "OpponentTeamID": "0", "PaceAdjust": "N",
        "Period": "0", "PlusMinus": "N", "Rank": "N", "TeamID": "0", "DateFrom": "", "DateTo": date_to,
        "Conference": "", "Division": "", "GameSegment": "", "Location": "", "Outcome": "",
        "SeasonSegment": "", "VsConference": "", "VsDivision": "", "ShotClockRange": "",
    }
    last = None
    for attempt in range(4):
        for use_proxy in (False, True):
            try:
                r = requests.get(BASE, params=params, headers=HDR, timeout=90, impersonate="chrome124",
                                 proxies=proxies if use_proxy else None)
                if r.status_code == 200:
                    js = r.json()
                    rs = js["resultSets"][0]
                    hdrs = rs["headers"]
                    idx = [hdrs.index(c) for c in KEEP if c in hdrs]
                    cols = [hdrs[i] for i in idx]
                    return cols, [[row[i] for i in idx] for row in rs["rowSet"]]
                last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = str(exc)[:120]
            if not proxies:
                break
        time.sleep(3 + attempt * 4)
    raise RuntimeError(f"leaguedashlineups failed ({season} {date_to}): {last}")


def main():
    proxy = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy, "http": proxy} if proxy else None
    every = int(os.environ.get("PAIRS_EVERY_DAYS", "7"))
    OUT.mkdir(parents=True, exist_ok=True)
    for season in [s.strip() for s in os.environ.get("PAIRS_SEASONS", "2024-25,2025-26").split(",")]:
        slug = season.replace("-", "_")
        lo, hi = (datetime.strptime(x, "%Y-%m-%d").date() for x in BOUNDS[season])
        d = lo + timedelta(days=every)
        made = 0
        while d <= hi:
            path = OUT / f"nba_pairs_{slug}_{d}.json"
            if path.exists():
                d += timedelta(days=every)
                continue
            cols, rows = get(season, d.strftime("%m/%d/%Y"), proxies)
            path.write_text(json.dumps({"meta": {"season": season, "as_of": str(d), "rows": len(rows),
                                                 "source": "leaguedashlineups GroupQuantity=2 DateTo",
                                                 "note": "AS-OF: totals for every two-man teammate combination through this date"},
                                        "columns": cols, "rows": rows}, separators=(",", ":")))
            made += 1
            print(f"{season} as-of {d}: {len(rows)} pairs -> {path.name}", flush=True)
            time.sleep(1.2)
            d += timedelta(days=every)
        print(f"{season}: {made} new snapshots", flush=True)


if __name__ == "__main__":
    main()
