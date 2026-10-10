#!/usr/bin/env python3
"""
PROBE (2026-10-09 evening, owner: "the PrizePicks - still try more, research online, use Gemini insight and you will find a
way"). Goal: a CHEAP (no full browser per run) path to the payout quote, POST api.prizepicks.com/game_types, which DataDome
has refused to every curl_cffi fingerprint since 09-30 (probe_pp_quote_paths.py, run 38015965386) while a real Chrome 154
passes (probe_pp_quote_browser.py, 78/78).
Research behind each arm (ledger "PRIZEPICKS QUOTES"):
  * curl_cffi's newest preset is chrome150 (0.16.3, 2026-09-02); the real Chrome is 154 -> version drift of the TLS/HTTP2
    fingerprint is the leading suspect. primp 2.x ships chrome_144..chrome_153 emulation (one version behind) -> arm P.
  * Gemini 2.5 Pro: the datadome cookie is bound to the fingerprint of the client that earned it, so a hand-off only works
    if the replaying client's TLS + HTTP/2 + header set matches the browser's -> arm F copies the real Chrome's own JA3 /
    Akamai-H2 / client hints (captured from tls.peet.ws through the SAME sticky exit IP) into curl_cffi, with and without
    the browser's cookies; arm P2 replays the cookies in primp chrome_153.
  * partner-api.prizepicks.com serves the board to curl_cffi -> arm H tries the quote POST on that host.
  * diagnostic: primp and curl_cffi also hit tls.peet.ws so their JA4 / Akamai hash print next to the real Chrome's.
One line per attempt: arm, client, egress, HTTP status, DATADOME yes/no, the Power 2-pick payout when answered.
Quotes only - nothing placed, no account. Env: PROXY_URL, PP_LEAGUE (7), GITHUB_RUN_ID.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pp_payout_map import API, BOARD_URLS, app_headers, parse_board  # noqa: E402

RAW = (os.environ.get("PROXY_URL") or "").strip()
PARTNER = "https://partner-api.prizepicks.com"
PEET = "https://tls.peet.ws/api/all"


def body_for(picks):
    return json.dumps({"new_wager": {"amount_bet_cents": 2000,
                                     "picks": [{"wager_type": "over", "projection_id": p["id"]} for p in picks],
                                     "pick_protection": False}, "game_mode": "prizepools"})


def verdict(st, txt):
    dd = "captcha-delivery" in (txt or "") or "datadome" in (txt or "").lower()[:400]
    pay = None
    try:
        for gt in (json.loads(txt).get("data") or []):
            a = gt.get("attributes") or {}
            if a.get("name") == "Power Play":
                pay = a.get("payouts")
    except Exception:  # noqa: BLE001
        pass
    return f"status {st}{' DATADOME' if dd else ''}{' PAYOUTS ' + json.dumps(pay) if pay else ''}"


def fp_line(tag, txt):
    try:
        j = json.loads(txt)
        t, h = j.get("tls") or {}, j.get("http2") or {}
        print(f"FP {tag:22s} ja4={t.get('ja4')} ja3_hash={t.get('ja3_hash')} peet={t.get('peetprint_hash')} "
              f"akamai={h.get('akamai_fingerprint')} ua={j.get('user_agent')}", flush=True)
        return j
    except Exception as exc:  # noqa: BLE001
        print(f"FP {tag:22s} unreadable: {str(exc)[:80]} {str(txt)[:120]!r}", flush=True)
        return None


def board():
    from curl_cffi import requests as creq
    for px in ({"http": RAW, "https": RAW} if RAW else None, None):
        for url in BOARD_URLS:
            try:
                r = creq.get(url, headers={"accept": "application/json"}, proxies=px, timeout=45, impersonate="chrome124")
                if r.status_code == 200 and (r.json().get("data") or []):
                    return parse_board(r.json())
            except Exception as exc:  # noqa: BLE001
                print(f"board {url.split('/')[2]}: {str(exc)[:60]}")
    return []


def primp_quote(target, proxy, picks, host=API, cookies=None, ua=None, os_="windows", warm=True):
    import primp
    try:
        kw = dict(impersonate=target, impersonate_os=os_, timeout=40, cookie_store=True)
        if proxy:
            kw["proxy"] = proxy
        c = primp.Client(**kw)
        if cookies:
            c.set_cookies("https://api.prizepicks.com", {k["name"]: k["value"] for k in cookies})
            c.set_cookies(host, {k["name"]: k["value"] for k in cookies})
        if warm and not cookies:
            try:
                c.get(BOARD_URLS[0].replace("per_page=1000", "per_page=50"), headers=app_headers())
            except Exception:  # noqa: BLE001
                pass
        h = app_headers({"content-type": "application/json"})
        if ua:
            h["user-agent"] = ua
        r = c.post(host + "/game_types", headers=h, content=body_for(picks).encode())
        return verdict(r.status_code, r.text)
    except Exception as exc:  # noqa: BLE001
        return f"error {type(exc).__name__}: {str(exc)[:90]}"


def primp_fp(target, proxy, os_="windows"):
    import primp
    try:
        kw = dict(impersonate=target, impersonate_os=os_, timeout=30)
        if proxy:
            kw["proxy"] = proxy
        fp_line(f"primp {target}", primp.Client(**kw).get(PEET).text)
    except Exception as exc:  # noqa: BLE001
        print(f"FP primp {target} error {str(exc)[:80]}", flush=True)


def curl_quote(target, px, picks, host=API):
    from curl_cffi import requests as creq
    try:
        s = creq.Session(impersonate=target)
        try:
            s.get(BOARD_URLS[0].replace("per_page=1000", "per_page=50"), headers=app_headers(), proxies=px, timeout=40)
        except Exception:  # noqa: BLE001
            pass
        r = s.post(host + "/game_types", headers=app_headers({"content-type": "application/json"}), data=body_for(picks),
                   proxies=px, timeout=40)
        return verdict(r.status_code, r.text)
    except Exception as exc:  # noqa: BLE001
        return f"error {type(exc).__name__}: {str(exc)[:90]}"


def chrome_headers(peet):
    """the client-hint headers the real Chrome sent (from tls.peet.ws's HTTP/2 HEADERS frame)."""
    out = {}
    for fr in (peet.get("http2") or {}).get("sent_frames") or []:
        for line in fr.get("headers") or []:
            k, _, v = line.partition(": ")
            if k.startswith("sec-ch-ua") or k in ("user-agent", "accept-language"):
                out[k] = v
    return out


def curl_copied(peet, px, picks, cookies=None, permute=True):
    """curl_cffi with the real Chrome's own JA3 + Akamai H2 fingerprint and client hints, Chrome's fetch header order."""
    from curl_cffi import requests as creq
    from curl_cffi.requests import ExtraFingerprints
    t, h2 = peet.get("tls") or {}, peet.get("http2") or {}
    ch = chrome_headers(peet)
    hdr = {"sec-ch-ua-platform": ch.get("sec-ch-ua-platform", '"Linux"'), "user-agent": ch.get("user-agent") or peet.get("user_agent"),
           "sec-ch-ua": ch.get("sec-ch-ua", ""), "content-type": "application/json", "sec-ch-ua-mobile": ch.get("sec-ch-ua-mobile", "?0"),
           "accept": "application/json", "origin": "https://app.prizepicks.com", "sec-fetch-site": "same-site",
           "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", "referer": "https://app.prizepicks.com/",
           "accept-encoding": "gzip, deflate, br, zstd", "accept-language": ch.get("accept-language", "en-US,en;q=0.9"),
           "priority": "u=1, i"}
    try:
        s = creq.Session(ja3=t.get("ja3"), akamai=h2.get("akamai_fingerprint"), default_headers=False,
                         extra_fp=ExtraFingerprints(tls_permute_extensions=permute, tls_grease=True, tls_cert_compression="brotli"))
        if cookies:
            for c in cookies:
                try:
                    s.cookies.set(c["name"], c["value"], domain=c.get("domain"))
                except Exception:  # noqa: BLE001
                    pass
        try:
            fp_line("curl copied-from-chrome", s.get(PEET, proxies=px, timeout=30).text)
        except Exception as exc:  # noqa: BLE001
            print(f"FP curl copied error {str(exc)[:100]}", flush=True)
        r = s.post(API + "/game_types", headers=hdr, data=body_for(picks), proxies=px, timeout=40)
        return verdict(r.status_code, r.text)
    except Exception as exc:  # noqa: BLE001
        return f"error {type(exc).__name__}: {str(exc)[:120]}"


def main():
    rows = board()
    std = [r for r in rows if r["odds"] == "standard"]
    picks, seen = [], set()
    for r in std:
        if r["player"] not in seen and r["game"] not in {p["game"] for p in picks}:
            picks.append(r); seen.add(r["player"])
        if len(picks) == 2:
            break
    picks = picks if len(picks) == 2 else std[:2]
    print(f"board {len(rows)} legs; picks {[(p['name'], p['stat'], p['line']) for p in picks]}", flush=True)
    if len(picks) < 2:
        print("not enough standard legs to quote"); return

    from betr_harvest_cloud import open_alive, start_local_proxy
    os.environ["BETR_SESSION_ID"] = f"ppcheap{os.getenv('GITHUB_RUN_ID', '0')}"
    lp, proxy_arg = start_local_proxy()
    loc = f"http://{proxy_arg}" if proxy_arg else None
    px_loc = {"http": loc, "https": loc} if loc else None
    px_raw = {"http": RAW, "https": RAW} if RAW else None
    try:
        # P: primp's newer Chrome emulation (chrome_153 = one behind the real 154), three egresses
        for tgt in ("chrome_153", "chrome_152", "chrome", "safari_26", "firefox_147"):
            for name, prx in (("sticky", loc), ("raw", RAW or None), ("direct", None)):
                print(f"P primp      {tgt:12s} {name:7s} {primp_quote(tgt, prx, picks)}", flush=True); time.sleep(2)
        for os_ in ("macos", "linux"):
            print(f"P primp      chrome_153   sticky os={os_} {primp_quote('chrome_153', loc, picks, os_=os_)}", flush=True); time.sleep(2)
        # H: the partner host
        print(f"H partner    primp153     sticky  {primp_quote('chrome_153', loc, picks, host=PARTNER)}", flush=True)
        print(f"H partner    curl150      sticky  {curl_quote('chrome150', px_loc, picks, host=PARTNER)}", flush=True)
        print(f"H partner    curl150      raw     {curl_quote('chrome150', px_raw, picks, host=PARTNER)}", flush=True)
        # diagnostics: what the cheap clients look like to a fingerprint echo
        for tgt in ("chrome_153", "chrome"):
            primp_fp(tgt, loc)
        try:
            from curl_cffi import requests as creq
            fp_line("curl chrome150", creq.get(PEET, impersonate="chrome150", proxies=px_loc, timeout=30).text)
        except Exception as exc:  # noqa: BLE001
            print(f"FP curl chrome150 error {str(exc)[:80]}", flush=True)

        # the real Chrome on the same exit IP: its fingerprint, then the copied-fingerprint and cookie arms
        from seleniumbase import SB
        kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True)
        if proxy_arg:
            kw["proxy"] = proxy_arg
        with SB(**kw) as sb:
            open_alive(sb, PEET, "peet", tries=3)
            time.sleep(2)
            peet = fp_line("REAL CHROME", sb.execute_script("return document.body.innerText"))
            open_alive(sb, "https://app.prizepicks.com/", "pp app", tries=6)
            for _ in range(2):
                try:
                    sb.uc_gui_click_captcha()
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(3)
            time.sleep(5)
            js = ("var d=arguments[arguments.length-1]; fetch(arguments[0],{method:'POST',credentials:'include',"
                  "headers:{'accept':'application/json','content-type':'application/json'},body:arguments[1]})"
                  ".then(function(r){return r.text().then(function(t){d([r.status,t]);});}).catch(function(e){d([-1,String(e)]);});")
            sb.driver.set_script_timeout(60)
            st, txt = sb.driver.execute_async_script(js, API + "/game_types", body_for(picks))
            print(f"E in-page    real chrome  sticky  {verdict(st, txt)}", flush=True)
            cookies = sb.driver.get_cookies()
            ua = sb.execute_script("return navigator.userAgent")
            print(f"browser cookies {sorted(c['name'] for c in cookies)}", flush=True)
            if peet:
                print(f"CH client hints {json.dumps(chrome_headers(peet))}", flush=True)
                print(f"F copied-fp  no cookies   sticky  {curl_copied(peet, px_loc, picks)}", flush=True); time.sleep(2)
                print(f"F copied-fp  +cookies     sticky  {curl_copied(peet, px_loc, picks, cookies=cookies)}", flush=True); time.sleep(2)
                print(f"F copied-fp  +cookies np  sticky  {curl_copied(peet, px_loc, picks, cookies=cookies, permute=False)}", flush=True)
            print(f"P2 primp153  +cookies+UA  sticky  {primp_quote('chrome_153', loc, picks, cookies=cookies, ua=ua, os_='linux')}", flush=True)
            print(f"P2 primp153  +cookies     sticky  {primp_quote('chrome_153', loc, picks, cookies=cookies, os_='linux')}", flush=True)
    finally:
        if lp:
            lp.terminate()


if __name__ == "__main__":
    main()
