#!/usr/bin/env python3
"""
PROBE (2026-10-09, owner: "find out how you did it before and sharpen it, so it can definitely be done again").
The payout quotes worked from 2026-09-21 to 09-29 with curl_cffi (PP_PAYOUT_FINDINGS §1: fingerprint chrome146, a Session,
a board GET warm-up, PROXY_URL egress) and were captcha'd from 09-30 on. A real Chrome works (§0j). This probe measures,
on today's board, every cheap path against the same 2-pick quote, so the mapper can use the cheapest one that works and
fall back in order:
  A. curl_cffi, the 09-21 recipe, per fingerprint (newest Chrome / Safari / Firefox targets), egress = raw PROXY_URL
  B. the same, egress = the runner's own IP (no proxy)
  C. the same, egress = the local sticky-session proxy (one DataImpulse exit IP for the whole probe)
  D. cookie hand-off: a real Chrome passes DataDome on that same exit IP, then curl_cffi reuses its cookies
     (datadome, cf_clearance, CSRF-TOKEN, _prizepicks_session ...) through the same local proxy - with and without
     Chrome's own User-Agent
  E. control: the in-page fetch from the Chrome (known good, run 38010173137)
Prints one line per attempt: path, fingerprint, HTTP status, DataDome yes/no, and the 2-pick Power payout when answered.
Quotes only, nothing placed, no account. Env: PROXY_URL, PP_LEAGUE (7).
"""
import json
import os
import sys
import time

from curl_cffi import requests as creq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pp_payout_map import API, BOARD_URLS, app_headers, parse_board  # noqa: E402
from betr_harvest_cloud import open_alive, start_local_proxy  # noqa: E402

TARGETS = ["chrome150", "chrome146", "chrome145", "chrome142", "safari260", "safari2601", "safari184_ios", "firefox147"]
RAW = (os.environ.get("PROXY_URL") or "").strip()


def board(px):
    for url in BOARD_URLS:
        try:
            r = creq.get(url, headers={"accept": "application/json"}, proxies=px, timeout=45, impersonate="chrome124")
            if r.status_code == 200 and (r.json().get("data") or []):
                return parse_board(r.json())
        except Exception as exc:  # noqa: BLE001
            print(f"board {url.split('/')[2]}: {str(exc)[:60]}")
    return []


def body_for(picks):
    return json.dumps({"new_wager": {"amount_bet_cents": 2000,
                                     "picks": [{"wager_type": "over", "projection_id": p["id"]} for p in picks],
                                     "pick_protection": False}, "game_mode": "prizepools"})


def verdict(st, txt):
    dd = "captcha-delivery" in (txt or "")
    pay = None
    try:
        for gt in (json.loads(txt).get("data") or []):
            a = gt.get("attributes") or {}
            if a.get("name") == "Power Play":
                pay = a.get("payouts")
    except Exception:  # noqa: BLE001
        pass
    return f"status {st}{' DATADOME' if dd else ''}{' payouts ' + json.dumps(pay) if pay else ''}"


def curl_quote(target, px, picks, cookies=None, ua=None):
    s = creq.Session(impersonate=target)
    if cookies:
        for c in cookies:
            try:
                s.cookies.set(c["name"], c["value"], domain=c.get("domain"))
            except Exception:  # noqa: BLE001
                pass
    else:
        try:   # the 09-21 warm-up: one board GET on the session
            s.get(BOARD_URLS[0].replace("per_page=1000", "per_page=50"), headers=app_headers(), proxies=px, timeout=40)
        except Exception:  # noqa: BLE001
            pass
    h = app_headers({"content-type": "application/json", "x-device-id": "probe-0001",
                     "x-device-info": "anonymousId=,name=,os=web,osVersion=,platform=web,appVersion=,gameMode=prizepools,stateCode="})
    if ua:
        h["user-agent"] = ua
    try:
        r = s.post(API + "/game_types", headers=h, data=body_for(picks), proxies=px, timeout=40)
        return verdict(r.status_code, r.text)
    except Exception as exc:  # noqa: BLE001
        return f"error {type(exc).__name__}: {str(exc)[:80]}"


def main():
    px_raw = {"http": RAW, "https": RAW} if RAW else None
    rows = board(px_raw) or board(None)
    std = [r for r in rows if r["odds"] == "standard"]
    picks, seen = [], set()
    for r in std:
        if r["player"] not in seen and r["game"] not in {p["game"] for p in picks}:
            picks.append(r); seen.add(r["player"])
        if len(picks) == 2:
            break
    if len(picks) < 2:
        picks = std[:2]
    print(f"board {len(rows)} legs; picks {[(p['name'], p['stat'], p['line']) for p in picks]}", flush=True)
    if len(picks) < 2:
        print("not enough standard legs to quote"); return

    for t in TARGETS:
        print(f"A raw-proxy  {t:14s} {curl_quote(t, px_raw, picks)}", flush=True); time.sleep(2)
    for t in TARGETS[:4]:
        print(f"B direct     {t:14s} {curl_quote(t, None, picks)}", flush=True); time.sleep(2)

    os.environ["BETR_SESSION_ID"] = f"ppprobe{os.getenv('GITHUB_RUN_ID', '0')}"
    lp, proxy_arg = start_local_proxy()
    px_loc = {"http": f"http://{proxy_arg}", "https": f"http://{proxy_arg}"} if proxy_arg else None
    try:
        for t in TARGETS[:4]:
            print(f"C sticky     {t:14s} {curl_quote(t, px_loc, picks)}", flush=True); time.sleep(2)
        from seleniumbase import SB
        kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True)
        if proxy_arg:
            kw["proxy"] = proxy_arg
        with SB(**kw) as sb:
            open_alive(sb, "https://app.prizepicks.com/", "pp app", tries=6)
            for _ in range(2):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(3)
            time.sleep(5)
            cookies = sb.driver.get_cookies()
            ua = sb.execute_script("return navigator.userAgent")
            print(f"browser: {len(cookies)} cookies, datadome={'datadome' in [c['name'] for c in cookies]}, UA {ua}", flush=True)
            for t in ("chrome150", "chrome146", "chrome142"):
                print(f"D handoff    {t:14s} {curl_quote(t, px_loc, picks, cookies=cookies)}", flush=True); time.sleep(2)
                print(f"D handoff+UA {t:14s} {curl_quote(t, px_loc, picks, cookies=cookies, ua=ua)}", flush=True); time.sleep(2)
            js = ("var d=arguments[arguments.length-1]; fetch(arguments[0],{method:'POST',credentials:'include',"
                  "headers:{'accept':'application/json','content-type':'application/json'},body:arguments[1]})"
                  ".then(function(r){return r.text().then(function(t){d([r.status,t]);});}).catch(function(e){d([-1,String(e)]);});")
            sb.driver.set_script_timeout(60)
            st, txt = sb.driver.execute_async_script(js, API + "/game_types", body_for(picks))
            print(f"E in-page    chrome         {verdict(st, txt)}", flush=True)
            # does the handoff still work AFTER the page has quoted (cookie refreshed by the page)?
            cookies2 = sb.driver.get_cookies()
            print(f"D2 handoff   chrome150      {curl_quote('chrome150', px_loc, picks, cookies=cookies2, ua=ua)}", flush=True)
    finally:
        if lp:
            lp.terminate()


if __name__ == "__main__":
    main()
