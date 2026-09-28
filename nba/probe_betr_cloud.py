#!/usr/bin/env python3
"""
Betr CLOUD test v2 (2026-09-28): fully-cloud harvest attempt on a GitHub runner.
Prior tests proved: UC Mode + Xvfb CLEARS Cloudflare on the runner, but an AUTHENTICATED residential proxy
breaks sub-resource loading (SPA stays at 39 bytes). FIX: run a LOCAL unauthenticated forward-proxy that
upstreams to ProxyScrape (with creds + US sticky session), and point Chromium at 127.0.0.1 (no auth).

Target league is WNBA (live now; NBA has no board until 2026-10-20 — identical shape, just the league arg).

Flow: local proxy up -> UC+Xvfb Chrome via 127.0.0.1 -> clear Turnstile -> click WNBA -> intercept the
page's own getUpcomingEventsV2 -> report 200 + event/leg counts. No login needed (board is anonymous once
the SPA loads from a US IP).
"""
import json
import os
import subprocess
import sys
import time

from seleniumbase import SB

URL = "https://picks.betr.app/"
LEAGUE = os.environ.get("BETR_LEAGUE", "WNBA").upper()
PROXY = os.environ.get("PROXY_URL", "").strip()
LOCAL_PORT = int(os.environ.get("BETR_LOCAL_PROXY_PORT", "8899"))


def start_local_proxy():
    """proxy.py as an unauth local listener that upstreams to the authenticated residential proxy.
    Returns (Popen, '127.0.0.1:port') or (None, None) if no upstream configured."""
    if not PROXY:
        return None, None
    raw = PROXY.split("://", 1)[-1].rstrip("/").split("/", 1)[0]
    if "@" not in raw:
        # already unauth or ip-allowlisted — use directly
        return None, raw
    creds, host = raw.rsplit("@", 1)
    user, _, pw = creds.partition(":")
    # US-sticky ProxyScrape session so the same US IP serves the whole SPA load
    if "-session-" not in user:
        sid = os.environ.get("BETR_SESSION_ID", "betrwnba1")
        user = f"{user}-country-us-session-{sid}-lifetime-10"
    upstream = f"{user}:{pw}@{host}"   # proxy.py --proxy-pool wants no scheme
    cmd = [sys.executable, "-m", "proxy",
           "--hostname", "127.0.0.1", "--port", str(LOCAL_PORT),
           "--plugins", "proxy.plugin.ProxyPoolPlugin",
           "--proxy-pool", upstream]
    print(f"starting local forward-proxy 127.0.0.1:{LOCAL_PORT} -> {host} (US sticky)", flush=True)
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(4)
    return p, f"127.0.0.1:{LOCAL_PORT}"


def main():
    seen = []
    board = None
    lp, proxy_arg = start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
        print(f"Chrome proxy -> {proxy_arg} (unauthenticated to Chrome)", flush=True)
    else:
        print("NO PROXY (direct)", flush=True)

    try:
        with SB(**kw) as sb:
            print(f"opening {URL} ...", flush=True)
            sb.uc_open_with_reconnect(URL, reconnect_time=10)
            try:
                sb.driver.execute_cdp_cmd("Network.enable", {})
            except Exception:  # noqa: BLE001
                pass
            for _ in range(3):
                try:
                    sb.uc_gui_click_captcha()
                    print("  uc_gui_click_captcha fired", flush=True)
                except Exception as exc:  # noqa: BLE001
                    print("  uc_gui_click_captcha:", str(exc)[:90], flush=True)
                time.sleep(5)

            booted = False
            handled_geo = False
            for i in range(40):  # up to 120s (residential is slow)
                try:
                    src = sb.get_page_source() or ""
                    ln = len(src); url = sb.get_current_url()
                    if i % 3 == 0 or ln > 5000:
                        print(f"  t+{i*3}s url={url[:80]} len={ln}", flush=True)
                    if "AllowLocation" in url and not handled_geo:
                        print("  >>> AllowLocation gate — trying to select a US state in-page", flush=True)
                        # The page renders a state selector. Try common paths: a dropdown, or a state link.
                        state = os.environ.get("BETR_STATE", "California")
                        for xp in (f'//*[normalize-space(text())="{state}"]',
                                   f'//option[normalize-space(text())="{state}"]',
                                   f'//li[contains(.,"{state}")]',
                                   f'//*[contains(@class,"state") and contains(.,"{state}")]',
                                   '//select'):
                            try:
                                if xp == '//select' and sb.is_element_visible(xp):
                                    sb.select_option_by_text(xp, state); print(f"  selected state via <select>: {state}", flush=True); handled_geo = True; break
                                if sb.is_element_visible(xp):
                                    sb.click(xp, timeout=3); print(f"  clicked state {xp}", flush=True); handled_geo = True; break
                            except Exception:  # noqa: BLE001
                                continue
                        time.sleep(4)
                    if ln > 5000 and "AllowLocation" not in url:
                        booted = True
                        print("  SPA rendered (past geo).", flush=True)
                        break
                except Exception as exc:  # noqa: BLE001
                    print("  read err:", str(exc)[:70], flush=True)
                time.sleep(3)

            if booted:
                # We're past Cloudflare + geo and the fantasy API answers 200. Investigate the /auth wall:
                # does the board load as a guest, or is login required? Log what the page offers.
                time.sleep(3)
                try:
                    u = sb.get_current_url()
                    src = sb.get_page_source() or ""
                    print(f"  after-geo url={u[:90]} len={len(src)}", flush=True)
                    # look for guest/skip affordances and for any league nav
                    for probe_txt in ("Continue", "Skip", "Guest", "Maybe later", "Not now", "Browse",
                                      "WNBA", "NBA", "Basketball", "Lineups", "Board", "Log in", "Sign up"):
                        try:
                            if sb.is_text_visible(probe_txt):
                                print(f"    visible: '{probe_txt}'", flush=True)
                        except Exception:  # noqa: BLE001
                            pass
                except Exception as exc:  # noqa: BLE001
                    print("  after-geo read err:", str(exc)[:80], flush=True)
                # try direct lobby deep-links regardless of /auth (the board may be public)
                for target in (f"{URL}lobby/{LEAGUE.lower()}", f"{URL}{LEAGUE.lower()}",
                               f"{URL}lineups/{LEAGUE.lower()}", URL):
                    try:
                        sb.uc_open_with_reconnect(target, reconnect_time=4)
                        time.sleep(5)
                        print(f"  -> {target} landed {sb.get_current_url()[:70]}", flush=True)
                    except Exception:  # noqa: BLE001
                        pass
                    for xp in (f'//*[normalize-space(text())="{LEAGUE}"]', f'//button[contains(.,"{LEAGUE}")]',
                               f'//a[contains(.,"{LEAGUE}")]', '//*[normalize-space(text())="Basketball"]'):
                        try:
                            if sb.is_element_visible(xp):
                                sb.click(xp, timeout=4)
                                print(f"  clicked {xp}", flush=True)
                                break
                        except Exception:  # noqa: BLE001
                            continue
                    time.sleep(3)

            # watch for the board response
            deadline = time.time() + 60
            while time.time() < deadline and not board:
                try:
                    logs = sb.driver.get_log("performance")
                except Exception:  # noqa: BLE001
                    logs = []
                ids = []
                for e in logs:
                    try:
                        m = json.loads(e["message"])["message"]
                    except Exception:  # noqa: BLE001
                        continue
                    if m.get("method") == "Network.responseReceived":
                        r = m["params"]["response"]
                        if "fantasy.betr.app/graphql" in r.get("url", ""):
                            if r.get("status") not in seen:
                                seen.append(r.get("status"))
                                print(f"  fantasy graphql status: {r.get('status')}", flush=True)
                            ids.append(m["params"]["requestId"])
                for rid in reversed(ids):
                    try:
                        b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid})
                        j = json.loads(b.get("body", ""))
                        if (j.get("data") or {}).get("getUpcomingEventsV2"):
                            board = j
                            print(f"  BOARD CAPTURED: {len(j['data']['getUpcomingEventsV2'])} events", flush=True)
                            break
                    except Exception:  # noqa: BLE001
                        continue
                time.sleep(3)
    finally:
        if lp:
            lp.terminate()

    ok = bool(board and (board.get("data") or {}).get("getUpcomingEventsV2"))
    print(f"\nRESULT: statuses={seen or 'none'} | 200={200 in seen} | BOARD={'YES' if ok else 'no'}", flush=True)
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
