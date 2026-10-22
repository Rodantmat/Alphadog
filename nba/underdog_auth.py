#!/usr/bin/env python3
"""
UNDERDOG ACCESS TOKEN - always fresh (owner 2026-10-21 17:37 PT: "create a token refresher so we can always have a fresh token like
betr"; the login comes from the GitHub secrets UD_EMAIL / UD_PASSWORD, the owner's choice - nothing typed in the chat).

access_token(conn) returns a fresh Underdog access token (lives minutes) for READ-ONLY calls (the entry estimate):
  1. refresh: POST login.underdogsports.com/oauth/token grant refresh_token (as Underdog's web app, bundle chunk 2890). Underdog
     ROTATES the refresh token on every use, and re-using an old one can revoke the whole session - so the stored token row is held
     FOR UPDATE for the whole exchange (one refresher at a time across every job) and the new token is saved before the lock is
     released.
  2. no stored token, or Underdog refused it: a fresh password login (underdog_login.py: credential store, then the secrets UD_EMAIL /
     UD_PASSWORD). A verification code (MFA) cannot be answered unattended - it fails loudly with LOGIN_CODE_SENT and the
     `NBA Underdog Login` workflow takes the code (otp).
Nothing is printed - no password, no token. Tokens live only in nba_config.external_credentials.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from underdog_login import AUD, CLIENT_ID, post  # noqa: E402


def _refresh(conn, sess, proxy):
    with conn.transaction():
        row = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'underdog_refresh_token' FOR UPDATE").fetchone()
        if not row or not row[0]:
            return None, "no stored refresh token"
        code, j = post(sess, "/oauth/token", {"grant_type": "refresh_token", "client_id": CLIENT_ID, "audience": AUD,
                                               "refresh_token": row[0], "scope": "offline_access"}, proxy)
        if code == 200 and j.get("access_token"):
            if j.get("refresh_token"):
                conn.execute("UPDATE nba_config.external_credentials SET credential_value_encrypted = %s, updated_at = now() WHERE credential_key = 'underdog_refresh_token'",
                             (j["refresh_token"],))
            return j, None
        return None, f"refresh refused HTTP {code}: {j.get('error')} - {j.get('error_description')}"


def access_token(conn, sess=None, proxy=None):
    from curl_cffi import requests as cr
    sess = sess or cr.Session(impersonate="chrome")
    proxy = (proxy if proxy is not None else os.environ.get("PROXY_URL", "")).strip()
    j, why = _refresh(conn, sess, proxy)
    if j:
        return j["access_token"], int(j.get("expires_in") or 0), "refreshed"
    print(f"UD_AUTH|{why} - logging in again", flush=True)
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "underdog_login.py")],
                       capture_output=True, text=True, env=dict(os.environ, UD_OTP=""))
    out = (r.stdout + r.stderr).strip().splitlines()
    print("UD_AUTH|" + (out[-1] if out else f"login exit {r.returncode}"), flush=True)
    if r.returncode != 0 or not any(l.startswith("LOGIN_OK") for l in out):
        return None, 0, "login failed"
    j, why = _refresh(conn, sess, proxy)
    return (j["access_token"], int(j.get("expires_in") or 0), "logged in") if j else (None, 0, why)


def main():
    """The refresher (workflow `NBA Underdog Token Refresh`): keep the session alive and prove it answers."""
    import psycopg
    from curl_cffi import requests as cr
    sess = cr.Session(impersonate="chrome")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        tok, exp, how = access_token(conn, sess)
    if not tok:
        print(f"UD_TOKEN_FAIL|{how}")
        sys.exit(1)
    # proof the token works: one read-only call as the signed-in user
    px = os.environ.get("PROXY_URL", "").strip()
    hdr = {"accept": "application/json", "authorization": f"Bearer {tok}", "origin": "https://app.underdogsports.com",
           "referer": "https://app.underdogsports.com/", "client-type": "web",
           "client-version": os.environ.get("UNDERDOG_CLIENT_VERSION", "20260907143253")}
    code = 0
    for p in ([px, None] if px else [None]):
        try:
            code = sess.get("https://api.underdogfantasy.com/v1/user/power_ups", headers=hdr, timeout=30,
                            proxies=({"https": p, "http": p} if p else None)).status_code
            break
        except Exception:  # noqa: BLE001 - next route
            continue
    print(f"UD_TOKEN_OK|{how}; access token lifetime {exp} s; signed-in check HTTP {code}")
    if code != 200:
        sys.exit(1)


if __name__ == "__main__":
    main()
