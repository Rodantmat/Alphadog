#!/usr/bin/env python3
"""
ONE-TIME CODE RELAY for the Sleeper / Fliff sign-in (owner 2026-10-25 23:00 PT: "If a code is needed I'll give to you and after we
setup the rule to get it saved to the system"). Workflow `NBA App OTP` (inputs app, otp) stores the code in
nba_config.external_credentials '<app>_otp', where the waiting `NBA App Login` run picks it up and deletes it. The code is read from
the dispatch event file (never a step env - GitHub prints step env values in the public log) and never printed. The input may be the
whole message the app sent (the owner's iPhone automation): the first run of 4-8 digits is taken.
"""
import json
import os
import re
import sys

import psycopg


def main():
    with open(os.environ["GITHUB_EVENT_PATH"]) as fh:
        inp = json.load(fh).get("inputs") or {}
    app = str(inp.get("app") or "").strip().lower()
    raw = str(inp.get("otp") or "")
    if app not in ("sleeper", "fliff"):
        print("OTP_FAIL|app must be sleeper or fliff"); sys.exit(1)
    m = re.search(r"(?<!\d)\d{4,8}(?!\d)", raw)
    if not m:
        print("OTP_FAIL|no 4-8 digit code in the input"); sys.exit(1)
    key = f"{app}_otp"
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        n = conn.execute("UPDATE nba_config.external_credentials SET credential_value_encrypted = %s, updated_at = now() WHERE credential_key = %s",
                         (m.group(0), key)).rowcount
        if not n:
            conn.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES (%s, %s, now())",
                         (key, m.group(0)))
        conn.commit()
    print(f"OTP_OK|code stored for the waiting {app} sign-in ({len(m.group(0))} digits)")


if __name__ == "__main__":
    main()
