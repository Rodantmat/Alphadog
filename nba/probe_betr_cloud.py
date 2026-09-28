#!/usr/bin/env python3
"""
Betr CLOUD test (2026-09-28): can a GitHub Actions Linux runner clear Cloudflare Turnstile with
SeleniumBase UC Mode + Xvfb (per the SB maintainer: "GitHub Actions jobs are correctly bypassing a CF
Turnstile")? This does NOT need a login — it just checks whether we reach the Betr lobby past Turnstile
and whether the anonymous config/board graphql calls come back 200 from the runner.

Routes the browser through PROXY_URL (residential) if set. Prints, at each stage, the page title/URL and
any fantasy.betr.app graphql statuses seen — so we KNOW if the runner passes the edge.
"""
import json
import os
import time

from seleniumbase import SB

URL = "https://picks.betr.app/"
PROXY = os.environ.get("PROXY_URL", "").strip()


def main():
    seen = []
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if PROXY and os.environ.get("BETR_NOPROXY", "0") != "1":
        # SeleniumBase wants user:pass@host:port (no scheme, no trailing slash/path)
        p = PROXY.split("://", 1)[-1].rstrip("/").split("/", 1)[0]
        kw["proxy"] = p
        print(f"using proxy {p.split('@')[-1] if '@' in p else p}", flush=True)
    else:
        print("NO PROXY (direct from the runner's datacenter IP) — isolating the SPA-blank cause", flush=True)
    else:
        print("no PROXY_URL — running on the runner's own datacenter IP (expected to be flagged)", flush=True)

    with SB(**kw) as sb:
        print("opening lobby via uc_open_with_reconnect ...", flush=True)
        sb.uc_open_with_reconnect(URL, reconnect_time=8)
        try:
            sb.driver.execute_cdp_cmd("Network.enable", {})
        except Exception:  # noqa: BLE001
            pass
        # attempt the CF click (Xvfb makes pyautogui work headless)
        for _ in range(3):
            try:
                sb.uc_gui_click_captcha()
                print("  uc_gui_click_captcha fired", flush=True)
            except Exception as exc:  # noqa: BLE001
                print("  uc_gui_click_captcha:", str(exc)[:100], flush=True)
            time.sleep(5)

        # WAIT for the SPA to actually render (page_length 39 = nothing loaded). Poll up to 60s.
        booted = False
        for i in range(20):
            try:
                src = sb.get_page_source() or ""
                ln = len(src)
                url = sb.get_current_url()
                print(f"  t+{i*3}s  url={url}  page_length={ln}", flush=True)
                if ln > 5000:
                    booted = True
                    flags = [w for w in ("Verify you are human", "challenge", "turnstile", "Just a moment")
                             if w.lower() in src.lower()]
                    print("  SPA rendered. cloudflare markers:", flags or "NONE", flush=True)
                    break
            except Exception as exc:  # noqa: BLE001
                print("  read error:", str(exc)[:80], flush=True)
            time.sleep(3)
        if not booted:
            print("  SPA never rendered (page stayed near-empty) — proxy too slow/unstable, or asset block.", flush=True)

        # watch ~40s for any fantasy graphql responses and their statuses
        deadline = time.time() + 40
        while time.time() < deadline:
            try:
                logs = sb.driver.get_log("performance")
            except Exception:  # noqa: BLE001
                logs = []
            for e in logs:
                try:
                    m = json.loads(e["message"])["message"]
                except Exception:  # noqa: BLE001
                    continue
                if m.get("method") == "Network.responseReceived":
                    r = m["params"]["response"]
                    if "fantasy.betr.app/graphql" in r.get("url", ""):
                        entry = (r.get("status"),)
                        if entry not in seen:
                            seen.append(entry)
                            print(f"  fantasy graphql status: {r.get('status')}", flush=True)
            time.sleep(3)

    print("\nRESULT: fantasy graphql statuses seen:", seen or "none",
          "| 200 present:", any(s[0] == 200 for s in seen))


if __name__ == "__main__":
    main()
