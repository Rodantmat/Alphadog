#!/usr/bin/env python3
"""
BETR BOARD - BROWSER-FREE CAPTURE WITH THE OWNER'S OWN TOKEN (2026-10-26; owner 16:22 PT: "Let's get it fixed ... get token and get it
figured out. We even had a token refresher working properly").

PROVEN (probe_betr_token_direct.py, run 40421094133): Betr's board query answers the owner's stored session token sent RAW in the
`authorization` header (the app's own way; a `Bearer ` prefix is what 401'd in September) - HTTP 200, 9 NBA events / 4,087
projections, straight from a GitHub runner and through the residential proxy alike. No browser, no Cloudflare check, nothing solved
or bypassed: the same request the app makes, with the owner's own sign-in. This replaces the SeleniumBase/Turnstile harvester for
the board (that browser path is retired).

Steps: the stored session (nba_config.external_credentials 'betr_session_state', GitHub secret as seed) -> the existing Keycloak
renewal with the owner's own offline refresh token when the access token is within 12 days of expiry (persisted back) -> ONE board
query (direct, then the proxy; transient errors retried) -> the same parser and file format as the harvester
(boards/betr_<league>_current.json + _meta, betr_nba_current.json) so the archiver and everything downstream read it unchanged.
READ-ONLY: a board query only - never CreateEntry or any mutation. Prints counts only, never the token.
Exit codes as the harvester: 0 board written | 2 session refused (401/403) | 3 no board for the league (file untouched) | 4 network.
Env: DATABASE_URL, PROXY_URL, BETR_LEAGUE (NBA), BETR_SESSION_STATE (seed), BETR_CLIENT_ID.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402  (parser, league filter, session load + renewal; no browser imported)

GQL = "https://api.fantasy.betr.app/graphql"
Q = ("query LeagueUpcomingEvents($league: League!) { getUpcomingEventsV2(league: $league) { id date status sport league name competitionType "
     "... on TeamVersusEvent { teams { id name fullName players { id firstName lastName position projections { marketId marketStatus isLive "
     "type label name key order value nonRegularPercentage nonRegularValue currentValue allowedOptions { marketOptionId outcome } } } } } } }")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
HDR = {"accept": "application/graphql-response+json, application/graphql+json, application/json", "content-type": "application/json",
       "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/", "user-agent": UA, "channel": "MOBILE_WEB",
       "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9", "promotions-api-version": "6.0", "jurisdiction": "CA"}


def access_token(state_text):
    s = json.loads(state_text)
    for v in (s.get("localStorage") or {}).values():
        if isinstance(v, str):
            for t in H.JWT_RE.findall(v):
                if H._claims(t).get("typ") == "Bearer":
                    return t
    return None


def query(tok):
    """(status, body or None, route). Direct first, then the proxy; 429/5xx/connection errors retried with a growing pause."""
    body = json.dumps({"operationName": "LeagueUpcomingEvents", "query": Q, "variables": {"league": H.LEAGUE}})
    last = (0, None, "none")
    from geo_proxy import geo
    for route, px in (("proxy", geo(H.PROXY) or None), ("direct", None)):  # owner location (San Diego) first
        if route == "proxy" and not px:
            continue
        for attempt in range(3):
            try:
                r = requests.post(GQL, headers=dict(HDR, authorization=tok), data=body, timeout=45, impersonate="chrome124",
                                  proxies={"https": px, "http": px} if px else None)
            except Exception as exc:  # noqa: BLE001
                print(f"  {route} attempt {attempt + 1}: {type(exc).__name__}", flush=True)
                last = (0, None, route); time.sleep(4 * (attempt + 1)); continue
            if r.status_code in (401, 403):
                return r.status_code, None, route
            if r.status_code == 429 or r.status_code >= 500:
                print(f"  {route} attempt {attempt + 1}: HTTP {r.status_code}", flush=True)
                last = (r.status_code, None, route); time.sleep(6 * (attempt + 1)); continue
            try:
                return r.status_code, r.json(), route
            except Exception:  # noqa: BLE001
                print(f"  {route} attempt {attempt + 1}: HTTP {r.status_code}, non-JSON answer", flush=True)
                last = (r.status_code, None, route); time.sleep(4 * (attempt + 1))
    return last


def main():
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    st, src = H.load_session_state()
    if not st:
        print("NO SESSION: neither the credential store nor BETR_SESSION_STATE holds a Betr session", file=sys.stderr); sys.exit(2)
    st, note = H.renew_session_state(st)
    print(f"session ({src}): {note}", flush=True)
    tok = access_token(st)
    if not tok:
        print("NO ACCESS TOKEN in the stored session", file=sys.stderr); sys.exit(2)
    exp = datetime.fromtimestamp(int(H._claims(tok).get("exp") or 0), timezone.utc)
    print(f"access token {H._h6(tok)} valid until {exp:%Y-%m-%d}", flush=True)
    code, body, route = query(tok)
    if code in (401, 403):
        print(f"SESSION REFUSED: HTTP {code} on the board query ({route}) - the stored session needs a fresh sign-in export", file=sys.stderr)
        sys.exit(2)
    if body is None:
        print(f"NO ANSWER: last HTTP {code} via {route} - network / Betr side; previous board file left untouched", file=sys.stderr)
        sys.exit(4)
    if body.get("errors") and not (body.get("data") or {}).get("getUpcomingEventsV2"):
        errs = "; ".join(str(e.get("message"))[:80] for e in body["errors"][:2])
        print(f"QUERY REFUSED (HTTP {code}): {errs} - the board query shape may have changed; file untouched", file=sys.stderr)
        sys.exit(2)
    legs, nevents = H.flatten(body)
    if not legs:
        print(f"NO {H.LEAGUE} BOARD WITH PROJECTIONS ({nevents} events) - previous board file left untouched", file=sys.stderr)
        sys.exit(3)
    meta = {"ok": True, "source": f"betr graphql getUpcomingEventsV2, owner token, no browser ({route})", "league": H.LEAGUE,
            "started_at": started, "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "legs": len(legs),
            "alt_legs": sum(1 for l in legs if l.get("alt")), "players": len({l["player_id"] for l in legs}), "events": nevents,
            "board_op": "getUpcomingEventsV2", "partial_lobby": False, "token_expires_at": f"{exp:%Y-%m-%dT%H:%M:%SZ}"}
    samples = {}
    for ev in H.board_events(body)[0]:
        for t in ev.get("teams") or []:
            for p in t.get("players") or []:
                for proj in p.get("projections") or []:
                    samples.setdefault(str(proj.get("type")), proj)
    meta["tier_samples"] = samples
    lg = H.LEAGUE.lower()
    (H.OUT / f"betr_{lg}_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    (H.OUT / f"betr_{lg}_current_meta.json").write_text(json.dumps(meta, indent=2))
    if H.LEAGUE == "NBA":
        (H.OUT / "betr_nba_current.json").write_text(json.dumps({"meta": meta, "legs": legs}, separators=(",", ":")))
    print(f"OK {H.LEAGUE}: {meta['legs']} legs ({meta['alt_legs']} alt), {meta['players']} players, {meta['events']} events, via {route}", flush=True)


if __name__ == "__main__":
    main()
