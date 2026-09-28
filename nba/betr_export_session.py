#!/usr/bin/env python3
"""
Betr session EXPORT (run once on the owner's PC, in the folder that has betr_profile/).
Opens Chrome with the logged-in betr_profile, reads picks.betr.app cookies + localStorage, and writes
betr_session_state.json. Put that file's CONTENTS into a GitHub secret named BETR_SESSION_STATE so the
cloud harvester can load the session into an ephemeral runner (the Betr board is login-only; no guest path,
confirmed 2026-09-28 — every /lobby URL redirects to /auth without a session).

Run (PowerShell, same dir as your betr_profile):
    python -m pip install --upgrade seleniumbase
    python betr_export_session.py
Then open betr_session_state.json, copy ALL of it, and save as GH secret BETR_SESSION_STATE.
Re-run whenever the cloud harvester starts failing on /auth (session expired).
"""
import json
import os
import time
from pathlib import Path

PROFILE = os.path.abspath(os.environ.get("BETR_PROFILE_DIR", "betr_profile"))
OUT = Path(os.environ.get("BETR_OUT_DIR", ".")) / "betr_session_state.json"
URL = "https://picks.betr.app/"


def main():
    from seleniumbase import SB
    with SB(uc=True, headless=False, locale="en-US", user_data_dir=PROFILE) as sb:
        print("opening Betr with your logged-in profile ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=6)
        try:
            sb.uc_gui_click_captcha()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(8)
        url = sb.get_current_url()
        if "/auth" in url:
            print("WARNING: landed on /auth — the profile is NOT logged in. Run betr_harvest.py with "
                  "BETR_LOGIN=1 first, then re-run this export.", flush=True)
        cookies = sb.driver.get_cookies()
        try:
            ls = sb.execute_script(
                "var o={}; for (var i=0;i<localStorage.length;i++){var k=localStorage.key(i); o[k]=localStorage.getItem(k);} return JSON.stringify(o);")
        except Exception:  # noqa: BLE001
            ls = "{}"
        state = {"url": url, "cookies": cookies, "localStorage": json.loads(ls) if ls else {},
                 "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        OUT.write_text(json.dumps(state))
        print(f"wrote {OUT}  (cookies: {len(cookies)}, localStorage keys: {len(state['localStorage'])})", flush=True)
        print("Now copy its contents into GH secret BETR_SESSION_STATE.", flush=True)


if __name__ == "__main__":
    main()
