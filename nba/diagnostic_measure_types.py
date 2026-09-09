#!/usr/bin/env python3
"""Probe: capture the REAL headers + one sample row for the Usage, Scoring, and Four Factors
MeasureTypes on the bulk playergamelogs/teamgamelogs endpoints, before designing any schema.
The public docs only document the Base schema for these endpoints - the other measure types'
column names are undocumented, so this is verified empirically rather than assumed (same
discipline that caught the v2/v3 and PlayerPosition-is-filter-only issues earlier)."""
import json
import os
import sys
import time
from pathlib import Path

from curl_cffi import requests

sys.path.insert(0, "nba")
from nba_season import active_stats_season

SEASON = active_stats_season()

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


def probe(endpoint, measure_type, result_set_name, proxies):
    url = (f"https://stats.nba.com/stats/{endpoint}?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00"
           f"&Location=&MeasureType={measure_type.replace(' ', '+')}&Month=0&OpponentTeamID=0&Outcome=&PORound=0"
           f"&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season={SEASON}&SeasonSegment="
           f"&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision=")
    if endpoint == "playergamelogs":
        url += "&PlayerExperience=&PlayerPosition=&StarterBench="
    try:
        resp = requests.get(url, headers=STATS_HEADERS, timeout=60, proxies=proxies, impersonate="chrome124")
        resp.raise_for_status()
        body = resp.json()
        rs = next((r for r in body.get("resultSets") or [] if r.get("name") == result_set_name), None)
        if not rs:
            return {"status": resp.status_code, "error": "result_set_not_found", "names": [r.get("name") for r in body.get("resultSets") or []]}
        headers = rs.get("headers", [])
        rows = rs.get("rowSet") or []
        return {"status": resp.status_code, "row_count": len(rows), "headers": headers, "sample_row": dict(zip(headers, rows[0])) if rows else None}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def main():
    proxy_url = os.environ.get("PROXY_URL", "").strip()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None
    out = {"season": SEASON}
    for endpoint, rs_name in (("playergamelogs", "PlayerGameLogs"), ("teamgamelogs", "TeamGameLogs")):
        for mt in ("Usage", "Scoring", "Four Factors"):
            out[f"{endpoint}::{mt}"] = probe(endpoint, mt, rs_name, proxies)
            time.sleep(1.5)
    # Period-props data gap check (2026-09-08): does the bulk playergamelogs endpoint honor
    # Period=1..4 to return per-quarter box scores? If yes, 1Q/2Q/3Q/4Q props are 4 cheap bulk
    # calls per season instead of 4x1230 per-game calls. Probe Period=1 and Period=4 on Base.
    for period in (1, 4):
        url = (f"https://stats.nba.com/stats/playergamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00"
               f"&Location=&MeasureType=Base&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals"
               f"&Period={period}&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season={SEASON}&SeasonSegment="
               f"&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=")
        try:
            resp = requests.get(url, headers=STATS_HEADERS, timeout=60, proxies=proxies, impersonate="chrome124")
            body = resp.json()
            rs = next((r for r in body.get("resultSets") or [] if r.get("name") == "PlayerGameLogs"), None)
            rows = rs.get("rowSet") if rs else []
            hdr = rs.get("headers") if rs else []
            sample = dict(zip(hdr, rows[0])) if rows else None
            # If Period works, MIN in the sample should be <= 12 and PTS small; if ignored, it's full-game.
            out[f"playergamelogs::Period={period}"] = {"status": resp.status_code, "row_count": len(rows), "sample_min": sample.get("MIN") if sample else None, "sample_pts": sample.get("PTS") if sample else None, "sample_player": sample.get("PLAYER_NAME") if sample else None}
        except Exception as exc:  # noqa: BLE001
            out[f"playergamelogs::Period={period}"] = {"error": str(exc)}
        time.sleep(1.5)
    Path("nba/data/nba_measure_type_probe.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    for k, v in out.items():
        if isinstance(v, dict):
            print(k, "->", v.get("status"), "rows:", v.get("row_count"), "cols:", len(v.get("headers") or []), "err:", v.get("error"))


if __name__ == "__main__":
    main()
