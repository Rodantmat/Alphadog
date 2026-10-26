#!/usr/bin/env python3
"""
PROBE - DOES BETR ANSWER ITS BOARD QUERY TO THE OWNER'S OWN TOKEN, WITHOUT A BROWSER? (2026-10-26; owner 16:22 PT: "get token and get
it figured out. We even had a token refresher working properly").  READ-ONLY: one board QUERY per variant, no mutation, no entry.
Re-tests the 2026-09-28 finding (BETR_BUILD_STATE.md section 3: every server-side request 401'd, the owner's own token included) with
TODAY's stored, self-renewed session token (nba_config.external_credentials.betr_session_state). Nothing is solved or bypassed: plain
HTTPS requests carrying the owner's token. Prints only HTTP status, the error code/message of a refusal, and event/leg counts of an
answer - never the token, never page text. Env: DATABASE_URL, PROXY_URL.
"""
import base64
import json
import os
import re
from datetime import datetime, timezone

import psycopg
from curl_cffi import requests

GQL = "https://api.fantasy.betr.app/graphql"
PROXY = os.environ.get("PROXY_URL", "").strip()
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
Q = ("query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) { id date status sport league name competitionType "
     "... on TeamVersusEvent { teams { id name fullName players { id firstName lastName position projections { marketId marketStatus isLive "
     "type label name key order value nonRegularPercentage nonRegularValue currentValue allowedOptions { marketOptionId outcome } } } } } } }")
# (the query the admin worker's betr_board_pull sent successfully on 2026-09-10 - 1,684 MLB legs, HTTP 200)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


def claims(t):
    try:
        p = t.split(".")[1]; p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))
    except Exception:  # noqa: BLE001
        return {}


def token():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        r = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='betr_session_state'").fetchone()
    s = json.loads(r[0])
    for v in (s.get("localStorage") or {}).values():
        if isinstance(v, str):
            for t in JWT_RE.findall(v):
                if claims(t).get("typ") == "Bearer":
                    return t
    return None


def main():
    tok = token()
    if not tok:
        print("BETR_DIRECT|no access token in the stored session"); return
    exp = datetime.fromtimestamp(int(claims(tok).get("exp") or 0), timezone.utc)
    print(f"BETR_DIRECT|stored access token valid until {exp:%Y-%m-%d %H:%M}Z ({(exp - datetime.now(timezone.utc)).days} d left)", flush=True)
    app = {"accept": "application/graphql-response+json, application/json", "content-type": "application/json",
           "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/", "user-agent": UA,
           "channel": "MOBILE_WEB", "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9", "jurisdiction": "CA"}
    body = json.dumps({"operationName": "LeagueUpcomingEvents", "query": Q, "variables": {"league": "NBA"}})
    for route, px in (("direct", None), ("residential proxy", PROXY or None)):
        if route != "direct" and not px:
            continue
        for auth in ("raw", "Bearer"):
            h = dict(app, authorization=tok if auth == "raw" else f"Bearer {tok}")
            try:
                r = requests.post(GQL, headers=h, data=body, timeout=30, impersonate="chrome124",
                                  proxies={"https": px, "http": px} if px else None)
            except Exception as exc:  # noqa: BLE001
                print(f"  {route:<18} auth={auth:<6} ERROR {type(exc).__name__}"); continue
            note = ""
            try:
                j = r.json()
                ev = ((j.get("data") or {}).get("getUpcomingEventsV2")) or []
                if ev:
                    legs = sum(len(p.get("projections") or []) for e in ev for p in (e.get("players") or []))
                    note = f"ANSWERED: {len(ev)} NBA events, {legs} projections"
                else:
                    errs = j.get("errors") or []
                    note = "refused: " + "; ".join(f"{(e.get('extensions') or {}).get('code')} {str(e.get('message'))[:60]}" for e in errs[:2])
            except Exception:  # noqa: BLE001
                note = f"non-JSON answer ({len(r.text or '')} bytes, cloudflare page: {'cloudflare' in (r.text or '').lower()})"
            print(f"  {route:<18} auth={auth:<6} HTTP {r.status_code}  {note}", flush=True)


if __name__ == "__main__":
    main()
