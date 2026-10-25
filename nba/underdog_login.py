#!/usr/bin/env python3
"""
UNDERDOG ONE-TIME LOGIN -> REFRESH TOKEN (owner 2026-10-21 17:32 PT: "I am on my iPhone, so can you get the token with the password
and use the token?").

Why: Underdog prices an entry with 2+ prediction-market picks (most of the CA board) only for a signed-in user (PP_PAYOUT_FINDINGS 0n).
What it does, exactly as Underdog's own web app does it (bundle chunk 600 / 2890, 2026-10-21):
  POST https://login.underdogsports.com/oauth/token  {grant_type: password, scope: offline_access, audience api.underdogfantasy.com,
       client_id cQvYz1T2BAFbix4dYR37dyD9O0Thf1s6, username, password, ud_client_type web, ud_client_version, ud_device_id}
  -> access token (short) + REFRESH token. If Underdog asks for a code (mfa_required): POST /mfa/challenge (oob) sends it to the
     owner's phone; the code goes back in as the workflow input `otp` and the login finishes with grant mfa-oob.
STORES ONLY: nba_config.external_credentials 'underdog_refresh_token' (+ 'underdog_device_id'; a pending MFA step as
'underdog_mfa_pending', deleted when done). THE PASSWORD (owner 17:33 PT: setting GitHub secrets on the iPhone is too hard - "save in
the database, whatever aligns better with the system"): read from external_credentials 'underdog_email' / 'underdog_password' (the
GitHub secrets UD_EMAIL / UD_PASSWORD are the fallback), and the 'underdog_password' row is DELETED as soon as the refresh token is
stored. Nothing is ever printed - not the password, not a token.
Use of the token: READ-ONLY price checks (GET /v4/entry_slips/estimate). Nothing here creates or submits an entry.
Underdog rotates the refresh token on every refresh - whoever refreshes must store the new one.
"""
import json
import os
import sys
import uuid

import psycopg
from curl_cffi import requests as cr

LOGIN = "https://login.underdogsports.com"
CLIENT_ID = "cQvYz1T2BAFbix4dYR37dyD9O0Thf1s6"
AUD = "https://api.underdogfantasy.com"
CLIENT_VERSION = os.environ.get("UNDERDOG_CLIENT_VERSION", "20260907143253")


def cred_get(conn, key):
    r = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = %s", (key,)).fetchone()
    return r[0] if r else None


def cred_put(conn, key, value):
    n = conn.execute("UPDATE nba_config.external_credentials SET credential_value_encrypted = %s, updated_at = now() WHERE credential_key = %s",
                     (value, key)).rowcount
    if not n:
        conn.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES (%s, %s, now())",
                     (key, value))
    conn.commit()


def cred_del(conn, key):
    conn.execute("DELETE FROM nba_config.external_credentials WHERE credential_key = %s", (key,))
    conn.commit()


def post(sess, path, data, proxy):
    hdr = {"content-type": "application/json", "accept": "application/json", "origin": "https://app.underdogsports.com",
           "referer": "https://app.underdogsports.com/"}
    last = None
    for px in ([proxy, None] if proxy else [None]):
        try:
            r = sess.post(LOGIN + path, data=json.dumps(data), headers=hdr, timeout=30, proxies=({"https": px, "http": px} if px else None))
            return r.status_code, (r.json() if r.text.strip().startswith("{") else {"raw": r.text[:200]})
        except Exception as e:  # noqa: BLE001 - next route
            last = type(e).__name__
    return 0, {"error": "unreachable", "error_description": last}


def store_tokens(conn, j):
    if not j.get("refresh_token"):
        print("LOGIN_FAIL|no refresh token in Underdog's answer (scope offline_access not granted)")
        sys.exit(1)
    cred_put(conn, "underdog_refresh_token", j["refresh_token"])
    cred_del(conn, "underdog_password")
    print(f"LOGIN_OK|refresh token stored in external_credentials (access token lifetime {j.get('expires_in')} s); the stored password row is deleted")


def main():
    url = os.environ["DATABASE_URL"]
    proxy = (os.environ.get("PROXY_URL") or "").strip()
    otp = (os.environ.get("UD_OTP") or "").strip()
    if not otp and os.environ.get("GITHUB_EVENT_PATH"):
        # 2026-10-25: the code is read from the dispatch event file, never from a step env (GitHub prints step env values in
        # the public log before any mask applies)
        try:
            with open(os.environ["GITHUB_EVENT_PATH"]) as fh:
                otp = str(((json.load(fh).get("inputs") or {}).get("otp")) or "").strip()
        except (OSError, ValueError):
            otp = ""
    if otp and not otp.isdigit():
        # 2026-10-25 (owner's iPhone automation): the WHOLE Underdog message may arrive as otp - take the code out of it here
        # (the first run of 4-8 digits), so the phone needs no text-parsing step. Nothing of the message is printed.
        import re
        m = re.search(r"(?<!\d)\d{4,8}(?!\d)", otp)
        if not m:
            print("LOGIN_FAIL|the otp input holds no 4-8 digit code")
            sys.exit(1)
        otp = m.group(0)
    sess = cr.Session(impersonate="chrome")
    with psycopg.connect(url) as conn:
        dev = cred_get(conn, "underdog_device_id")
        if not dev:
            dev = str(uuid.uuid4())
            cred_put(conn, "underdog_device_id", dev)
        if otp:
            pend = cred_get(conn, "underdog_mfa_pending")
            if not pend:
                print("LOGIN_FAIL|no pending code step - run once without otp first")
                sys.exit(1)
            p = json.loads(pend)
            # exactly the web app's call (bundle chunk 600: audience + scope included)
            code, j = post(sess, "/oauth/token", {"audience": AUD, "binding_code": otp, "client_id": CLIENT_ID,
                                                   "grant_type": "http://auth0.com/oauth/grant-type/mfa-oob",
                                                   "mfa_token": p["mfa_token"], "oob_code": p["oob_code"], "scope": "offline_access"}, proxy)
            if code != 200 and not j.get("error"):
                print(f"LOGIN_DETAIL|non-JSON answer: {str(j.get('raw') or '')[:160]!r}")
            if code == 200 and j.get("access_token"):
                store_tokens(conn, j)
                cred_del(conn, "underdog_mfa_pending")
                return
            print(f"LOGIN_FAIL|code step HTTP {code}: {j.get('error')} - {j.get('error_description')}")
            sys.exit(1)
        email = cred_get(conn, "underdog_email") or os.environ.get("UD_EMAIL", "")
        pw = cred_get(conn, "underdog_password") or os.environ.get("UD_PASSWORD", "")
        if not email or not pw:
            print("LOGIN_FAIL|no Underdog login in external_credentials (underdog_email / underdog_password) or the GitHub secrets")
            sys.exit(1)
        code, j = post(sess, "/oauth/token", {"grant_type": "password", "scope": "offline_access", "audience": AUD, "client_id": CLIENT_ID,
                                               "username": email, "password": pw, "ud_client_type": "web",
                                               "ud_client_version": CLIENT_VERSION, "ud_device_id": dev}, proxy)
        if code == 200 and j.get("access_token"):
            store_tokens(conn, j)
            return
        if j.get("error") == "mfa_required" and j.get("mfa_token"):
            c2, j2 = post(sess, "/mfa/challenge", {"client_id": CLIENT_ID, "challenge_type": "oob", "mfa_token": j["mfa_token"]}, proxy)
            if c2 == 200 and j2.get("oob_code"):
                cred_put(conn, "underdog_mfa_pending", json.dumps({"mfa_token": j["mfa_token"], "oob_code": j2["oob_code"]}))
                print("LOGIN_CODE_SENT|Underdog sent a verification code to the account's phone/email - run again with input otp=<code>")
                return
            print(f"LOGIN_FAIL|code challenge HTTP {c2}: {j2.get('error')} - {j2.get('error_description')}")
            sys.exit(1)
        print(f"LOGIN_FAIL|HTTP {code}: {j.get('error')} - {j.get('error_description')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
