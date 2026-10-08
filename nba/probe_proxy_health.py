#!/usr/bin/env python3
"""
PROXY HEALTH PROBE (2026-10-07, full-system certification pass A-7). Answers one question from a GitHub runner: does the
shared residential proxy (secret PROXY_URL) accept CONNECTs again, and do the two sources that need it answer through it?
Never prints the proxy URL or any credential - only host, status and timing.

Checks (each 20 s max):
  1. proxy  -> https://stats.nba.com/stats/scoreboardv2 (needs the proxy; 407 = proxy auth/plan problem, not the site)
  2. proxy  -> https://api.prizepicks.com/projections?league_id=7&per_page=1
  3. direct -> https://api.prizepicks.com/projections?league_id=7&per_page=1 (fallback path used by the injury scraper)
  4. direct -> https://www.darko.app/__data.json (P1 DARKO, no proxy needed)
Exit 0 if check 1 passes (the proxy is back), 1 otherwise.
"""
import os
import sys
import time

from curl_cffi import requests

NBA_HEADERS = {"Referer": "https://www.nba.com/", "Origin": "https://www.nba.com", "Accept": "application/json",
               "x-nba-stats-origin": "stats", "x-nba-stats-token": "true"}


def probe(label, url, proxies=None, headers=None):
    t0 = time.time()
    try:
        r = requests.get(url, headers=headers or {}, proxies=proxies, timeout=20, impersonate="chrome124")
        print(f"  {label:<44} HTTP {r.status_code}  {len(r.content):>8} bytes  {time.time() - t0:5.1f}s")
        return r.status_code
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        for secret in (os.environ.get("PROXY_URL") or "",):
            if secret:
                msg = msg.replace(secret, "<PROXY_URL>")
        print(f"  {label:<44} ERROR {msg[:140]}  {time.time() - t0:5.1f}s")
        return None


def db_proxy_url():
    """The proxy URL the owner stores in nba_config.external_credentials ('proxy_url') - the system's credential store
    (API keys live there by rule). Preferred over the PROXY_URL secret when present, so a provider change is one row."""
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return None
    try:
        import psycopg
        with psycopg.connect(dsn) as c:
            r = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='proxy_url'").fetchone()
        return (r[0] or "").strip() if r else None
    except Exception as exc:  # noqa: BLE001
        print(f"db credential lookup failed: {str(exc)[:100]}")
        return None


def main():
    src = "nba_config.external_credentials/proxy_url"
    proxy_url = db_proxy_url()
    if not proxy_url:
        src = "PROXY_URL secret"
        proxy_url = (os.environ.get("PROXY_URL") or "").strip()
    if not proxy_url:
        print("no proxy URL available (neither the DB credential nor the PROXY_URL secret)"); sys.exit(1)
    host = proxy_url.split("@")[-1].rstrip("/")
    print(f"proxy host: {host}  (source: {src})")
    proxies = {"https": proxy_url, "http": proxy_url}
    s1 = probe("proxy  -> stats.nba.com scoreboardv2", "https://stats.nba.com/stats/scoreboardv2?GameDate=2026-10-21&LeagueID=00&DayOffset=0", proxies, NBA_HEADERS)
    probe("proxy  -> api.prizepicks.com projections", "https://api.prizepicks.com/projections?league_id=7&per_page=1", proxies)
    probe("direct -> api.prizepicks.com projections", "https://api.prizepicks.com/projections?league_id=7&per_page=1")
    probe("direct -> darko.app __data.json", "https://www.darko.app/__data.json")
    ok = s1 is not None and s1 < 400
    print("PROXY " + ("OK - CONNECTs accepted again" if ok else "STILL DOWN (407 = the proxy refuses our credentials/plan; the sites are fine)"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
