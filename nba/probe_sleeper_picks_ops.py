#!/usr/bin/env python3
"""
PROBE - SLEEPER PICKS, SIGNED IN AS THE OWNER, IN A REAL BROWSER: WHICH CALLS THE PICKS PAGE MAKES (2026-10-26). The owner signed in on
his own browser and handed the session over (nba_config.external_credentials 'sleeper_token'; the web app keeps it in localStorage
'token' next to 'user_id'). This run seeds those two keys into the worker's Chrome (same proxy / San Diego / device setup as
app_login.py), opens sleeper.com/picks and the NBA picks page, and prints every GraphQL operation the page sends (name + variable
NAMES) and the STRUCTURE of each answer (keys and value types, never values) - the map for the next step (reading Sleeper's own
multipliers / payouts per slip). READ-ONLY: it only loads pages; it clicks nothing and never submits an entry. The token is never
printed.
Env: DATABASE_URL, PROXY_URL.
"""
import base64
import json
import os
import sys
import time

os.environ.setdefault("APP", "sleeper")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app_login as A  # noqa: E402
import psycopg  # noqa: E402
from seleniumbase import SB  # noqa: E402


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        tok = (A.cred(conn, "sleeper_token") or "").strip()
    if not tok:
        print("PICKS_OPS|no sleeper_token stored"); sys.exit(1)
    pl = tok.split(".")[1]
    uid = str(json.loads(base64.urlsafe_b64decode(pl + "=" * (-len(pl) % 4)))["user_id"])
    A.PRE[0] = False                           # signed in: never print button text or page text (names, balances)
    os.environ["BETR_SESSION_ID"] = A.CFG["sid"]
    lp, proxy_arg = A.H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    seen = set()
    try:
        with SB(**kw) as sb:
            A.H.open_alive(sb, "https://sleeper.com/", "home")
            A.setup_browser(sb)
            A.H.enable_network(sb)
            sb.execute_script("localStorage.setItem('token', arguments[0]); localStorage.setItem('user_id', arguments[1]);", tok, uid)
            for url in ("https://sleeper.com/picks", "https://sleeper.com/picks/nba"):
                A.H.open_alive(sb, url, url.rsplit("/", 1)[-1])
                A.setup_browser(sb)
                time.sleep(12)
                A.requests_seen(sb, seen)
                f = A.form(sb, url)
                signed = "LOG IN" not in [b.upper() for b in f["buttons"]]
                print(f"PICKS_OPS|{url} signed-in look: {signed} | page {f.get('n')} elements", flush=True)
            st = A.snapshot(sb)
            print(f"PICKS_OPS|storage keys after load: {sorted(st['localStorage'])[:30]}", flush=True)
    finally:
        if lp:
            lp.terminate()


if __name__ == "__main__":
    main()
