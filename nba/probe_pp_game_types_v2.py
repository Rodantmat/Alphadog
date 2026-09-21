#!/usr/bin/env python3
"""
PROBE 4 - PrizePicks /game_types with CONSISTENT fingerprints, SESSIONS and WARM-UP.

WHY PROBE 3 FAILED (diagnosed 2026-09-21). It impersonated Chrome 124 at the TLS layer but sent a
Chrome 139 / Windows User-Agent header. The handshake and the header disagreed - a textbook bot signal
that DataDome checks first. The working board scraper is CONSISTENT (TLS 124 + UA 124). Probe 3 also
used no Session (every call cold, never carrying the datadome cookie a passed request earns) and no
warm-up (a real browser loads the board before it ever quotes).

THIS PROBE, per fingerprint target:
  * a Session, so cookies persist exactly as in a browser
  * NO manual User-Agent / sec-ch-ua / accept-language - curl_cffi supplies them, consistent with
    its own TLS fingerprint. Only app-level headers are added (origin, referer, content-type,
    fetch-metadata for an XHR, device id/info)
  * warm-up GET of the board first, logging which cookies that earns
  * then POST /game_types with the known Tatum goblin + Wemby demon pair (expect 2.2)
Stops at the first target that returns payouts.

Reading the outcome:
  200 + payouts      -> server-side access works, anonymously. No account involved.
  401 / 422 / other  -> DataDome PASSED; the endpoint wants auth or location. Progress.
  403 captcha        -> DataDome still blocks this fingerprint.
  all captcha        -> DataDome wants its JavaScript-generated cookie, which no HTTP client can
                        compute. Only a real browser engine gets past that.

SAFETY: quotes only - /game_types never places an entry. No owner cookies, no owner location.
"""
import json
import os
import time
import uuid

BASE = "https://api.prizepicks.com"
BOARD = f"{BASE}/projections?league_id=7&per_page=250&single_stat=true"
PAIR = ["13975905", "13976089"]      # Tatum 1.5 3PTM goblin + Wemby 11.5 Reb demon -> 2.2x
TARGETS = ["chrome124", "chrome136", "chrome146", "chrome131_android",
           "safari184_ios", "safari260", "firefox147"]


def proxies():
    u = (os.getenv("PROXY_URL") or "").strip()
    return {"http": u, "https": u} if u else None


def app_headers(extra=None):
    h = {"accept": "application/json", "origin": "https://app.prizepicks.com",
         "referer": "https://app.prizepicks.com/",
         "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty"}
    if extra:
        h.update(extra)
    return h


def is_captcha(txt):
    return "captcha-delivery" in (txt or "") or "geo.captcha" in (txt or "")


def try_target(target, px):
    from curl_cffi import requests
    s = requests.Session(impersonate=target)
    dev = str(uuid.uuid4())
    out = {"target": target}

    # warm-up: the board, exactly as the app loads it
    try:
        r = s.get(BOARD, headers=app_headers(), proxies=px, timeout=40)
        out["warm"] = r.status_code
        out["warm_rows"] = len((r.json() or {}).get("data") or []) if r.status_code == 200 else 0
    except Exception as exc:  # noqa: BLE001
        out["warm"] = f"ERR {str(exc)[:60]}"
    out["cookies"] = sorted(s.cookies.keys())
    out["ua"] = (s.headers.get("user-agent") or s.headers.get("User-Agent") or "(curl default)")[:70]
    time.sleep(1.5)

    body = {"new_wager": {"amount_bet_cents": 2000,
                          "picks": [{"wager_type": "over", "projection_id": p} for p in PAIR],
                          "pick_protection": False},
            "game_mode": "prizepools"}
    h = app_headers({"content-type": "application/json", "x-device-id": dev,
                     "x-device-info": ("anonymousId=,name=,os=web,osVersion=,platform=web,"
                                       "appVersion=,gameMode=prizepools,stateCode=")})
    try:
        r = s.post(BASE + "/game_types", headers=h, data=json.dumps(body), proxies=px, timeout=40)
        out["post"] = r.status_code
        txt = r.text or ""
        out["captcha"] = is_captcha(txt)
        out["body"] = txt[:260].replace("\n", " ")
        try:
            j = r.json()
            for gt in (j or {}).get("data") or []:
                a = gt.get("attributes") or {}
                if a.get("name") == "Power Play":
                    out["power2"] = (a.get("payouts") or {}).get("2", {}).get("2")
        except Exception:  # noqa: BLE001
            pass
    except Exception as exc:  # noqa: BLE001
        out["post"] = f"ERR {str(exc)[:60]}"
    out["cookies_after"] = sorted(s.cookies.keys())
    return out


def main():
    from curl_cffi import requests
    px = proxies()
    print("=" * 78)
    print("PROBE 4 - consistent fingerprints + session + warm-up")
    print("=" * 78, flush=True)
    if px:
        try:
            e = requests.get("https://ipinfo.io/json", proxies=px, timeout=20, impersonate="chrome124").json()
            print(f"EGRESS|{e.get('ip')}|{e.get('country')}/{e.get('region')}|org={e.get('org')}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"EGRESS|FAIL|{str(exc)[:80]}", flush=True)

    verdict = "ALL CAPTCHA - needs a real browser engine"
    for t in TARGETS:
        o = try_target(t, px)
        print(f"\nTARGET|{t}", flush=True)
        print(f"  WARM|{o.get('warm')}|rows={o.get('warm_rows')}|cookies={o.get('cookies')}", flush=True)
        print(f"  UA|{o.get('ua')}", flush=True)
        print(f"  POST|{o.get('post')}|captcha={o.get('captcha')}|power2={o.get('power2')}"
              f"|cookies_after={o.get('cookies_after')}", flush=True)
        print(f"  BODY|{o.get('body')}", flush=True)
        if o.get("power2") is not None:
            verdict = f"SUCCESS with {t}: power2={o['power2']} (expect 2.2)"
            break
        if o.get("post") not in (403, None) and not o.get("captcha"):
            verdict = f"DATADOME PASSED with {t} - status {o.get('post')} (auth or location wanted)"
            break
        time.sleep(3)
    print(f"\nVERDICT|{verdict}", flush=True)


if __name__ == "__main__":
    main()
