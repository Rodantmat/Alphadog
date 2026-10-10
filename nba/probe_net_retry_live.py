#!/usr/bin/env python3
"""
PROBE (2026-10-09): the rewritten external calls (nba/net_retry.py) answer live, through the same egress the pipelines use.
Read-only: nothing is written, no claim is taken, no paid credits (the Odds API /sports list is free; ParlayAPI is not called).
  1. stats.nba.com via scrape_nba_schedule.fetch (proxy-only, 4 attempts)
  2. stats.nba.com via scrape_nba_daily_delta.fetch_bulk (teamgamelogs 2025-26)
  3. the Odds API sports list (free endpoint, 0 credits) via capture_game_lines_morning.get
  4. injury-report PDF fetch for a known past filing, and a nonexistent one (final 403/404, no retry)
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg  # noqa: E402

from nba_season import stats_seasons  # noqa: E402

PROXY = os.environ.get("PROXY_URL", "").strip()
PX = {"https": PROXY, "http": PROXY} if PROXY else None


def step(name, fn):
    t0 = time.time()
    try:
        out = fn()
        print(f"OK   {name}: {out} ({time.time() - t0:.1f}s)", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {name}: {type(exc).__name__}: {str(exc)[:200]} ({time.time() - t0:.1f}s)", flush=True)


def main():
    season = stats_seasons(1)[0]
    import scrape_nba_schedule as sch
    step(f"schedule {season}", lambda: (lambda r: f"http {r[1]}, {len(str(r[0]))} bytes")(sch.fetch(season)))
    import scrape_nba_daily_delta as dd
    url = ("https://stats.nba.com/stats/teamgamelogs?DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&MeasureType=Base"
           "&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=Totals&Period=0&PlusMinus=N&Rank=N&Season=2025-26"
           "&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&TeamID=0&VsConference=&VsDivision=")
    step("daily delta teamgamelogs 2025-26", lambda: (lambda r: f"rows={len(r[0]) if r[0] is not None else None} err={r[1]}")(dd.fetch_bulk(url, "TeamGameLogs", PX)))
    import requests
    import capture_game_lines_morning as gl
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        key = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='odds_api_key_nba'").fetchone()[0].strip()
    s = requests.Session()
    step("odds api /sports (0 credits)", lambda: (lambda r: f"sports={len(r[0]) if r[0] else None} remaining={r[1]} err={r[2]}")(gl.get(s, f"https://api.the-odds-api.com/v4/sports?apiKey={key}")))
    import scrape_nba_injury_report as inj
    from curl_cffi import requests as creq
    sess = creq.Session(proxies=PX) if PX else creq.Session()
    step("injury pdf (past filing 2026-04-12 05:30PM)", lambda: (lambda r: f"{'PDF ' + str(len(r[1])) + ' bytes' if r else 'not found'}")(
        inj._get_pdf(sess, "https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-04-12_05_30PM.pdf")))
    step("injury pdf (nonexistent -> final 403/404, no retry)", lambda: inj._get_pdf(sess, "https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-04-12_05_31PM.pdf"))


if __name__ == "__main__":
    main()
