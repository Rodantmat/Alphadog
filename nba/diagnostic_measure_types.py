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
    Path("nba/data/nba_measure_type_probe.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    for k, v in out.items():
        if isinstance(v, dict):
            print(k, "->", v.get("status"), "rows:", v.get("row_count"), "cols:", len(v.get("headers") or []), "err:", v.get("error"))


if __name__ == "__main__":
    main()
