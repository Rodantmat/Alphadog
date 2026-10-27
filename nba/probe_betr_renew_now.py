#!/usr/bin/env python3
"""
PROBE - RENEW THE BETR SESSION NOW AND PROVE THE NEW TOKEN READS THE BOARD (2026-10-26; owner 17:04 PT: "Token renewed and be sure
that we have it from now on"). The daily capture (betr_board_direct.py) renews the owner's session only within 12 days of expiry
(first automatic renewal ~2026-11-03); this run forces that same renewal today (BETR_RENEW_DAYS=400 before import) so the path is
proven end to end: Keycloak refresh with the owner's own offline refresh token -> new access token persisted to
nba_config.external_credentials ('betr_session_state', 'betr_refresh_token') -> one read-only board query with the NEW token.
Prints expiry dates, 6-char hashes and counts only - never a token. Env: DATABASE_URL, PROXY_URL.
"""
import os
import sys

os.environ["BETR_RENEW_DAYS"] = "400"      # force the renewal today (the normal threshold is 12 days)
os.environ.setdefault("BETR_LEAGUE", "NBA")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_board_direct as D  # noqa: E402
import betr_harvest_cloud as H  # noqa: E402


def main():
    st, src = H.load_session_state()
    before = D.access_token(st)
    print(f"BEFORE ({src}): access {H._h6(before)} exp {H._claims(before).get('exp')}", flush=True)
    st2, note = H.renew_session_state(st)
    print(note, flush=True)
    st3, src3 = H.load_session_state()
    after = D.access_token(st3)
    print(f"STORED NOW ({src3}): access {H._h6(after)}; changed: {after != before}", flush=True)
    code, body, route = D.query(after)
    legs, nev = H.flatten(body) if body else ([], 0)
    print(f"BOARD WITH THE STORED TOKEN: HTTP {code} via {route}, {nev} events, {len(legs)} legs", flush=True)
    if code != 200 or not legs:
        sys.exit(1)


if __name__ == "__main__":
    main()
