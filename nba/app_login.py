#!/usr/bin/env python3
"""
SLEEPER / FLIFF SIGN-IN -> STORED SESSION (owner 2026-10-25 22:55 PT: "I'll save my password and user on a secret, same way we did
with underdog, if it needs a code by email or phone we create a rule to do so, for each app"; 23:00 PT: "copy the setting from
underdog, same pace, same signatures, proxy, location, device, all same proven safe configs for both. If a code is needed I'll give
to you ... Create the same auto renew token for both").

WHY A REAL BROWSER: neither app prices an entry for a visitor (Sleeper's web Picks lobby and Fliff's Pick'Em quote/contest calls are
private - probes 40272582774 / 40274277189 / 40275957324). Both sign in through their own web page behind an invisible captcha
(Fliff loads Google reCAPTCHA v3), so the login is done exactly as a person does it: the web page in a real Chrome
(SeleniumBase UC + Xvfb, the Betr harvest chain), typed at human pace.
SAME PROVEN CONFIG AS UNDERDOG / BETR: the residential proxy from the credential store as a sticky US session (one fixed session id
per app), location San Diego (Underdog's 32.6515, -116.8551; Chrome geolocation + time zone America/Los_Angeles + en-US), one
persistent device per app (its id and the app's own device keys live in the stored session and are seeded back every run), human
timing (random pauses, key-by-key typing).
LOGIN: GitHub secrets SLEEPER_EMAIL / SLEEPER_PASSWORD, FLIFF_EMAIL / FLIFF_PASSWORD (never printed, never stored).
ONE-TIME CODE: if the app asks for a code, the run prints LOGIN_CODE_SENT and WAITS (up to APP_OTP_WAIT_S, default 900 s) for the code
in nba_config.external_credentials '<app>_otp' (written by workflow `NBA App OTP` or by Claude when the owner gives it); the row is
deleted as soon as it is read. The code is never printed.
STORES ONLY: nba_config.external_credentials '<app>_session_state' = {localStorage, cookies, saved_at} of the signed-in app (the
auto-renew job reopens the app with it and saves the renewed state). Nothing creates or submits an entry; nothing prints a token.
Diagnostics print only page addresses, titles, form field TYPES / labels and request paths (never a value or a request body).
Env: DATABASE_URL, PROXY_URL, APP (sleeper | fliff), <APP>_EMAIL, <APP>_PASSWORD, APP_MODE (login | refresh), APP_OTP_WAIT_S.
"""
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("BETR_SESSION_ID", "x")
import betr_harvest_cloud as H  # noqa: E402  (proxy helper, network enable, net-error reload)
from seleniumbase import SB  # noqa: E402

APP = (os.environ.get("APP") or "sleeper").lower()
MODE = (os.environ.get("APP_MODE") or "login").lower()
LAT, LON = 32.65148161377867, -116.8550890281236          # Underdog's proven location (San Diego)
CFG = {
    "sleeper": {"home": "https://sleeper.com/", "login": "https://sleeper.com/login", "picks": "https://sleeper.com/picks",
                "origin": "https://sleeper.com", "sid": "sleeperauth1"},
    "fliff": {"home": "https://sports.getfliff.com/", "login": "https://sports.getfliff.com/", "picks": "https://sports.getfliff.com/",
              "origin": "https://sports.getfliff.com", "sid": "fliffauth1"},
}[APP]
TOKENISH = re.compile(r"(token|auth|session|jwt|bearer|refresh)", re.I)


def pause(a=0.6, b=1.8):
    time.sleep(random.uniform(a, b))


def cred(conn, key, value=None, delete=False):
    if delete:
        conn.execute("DELETE FROM nba_config.external_credentials WHERE credential_key = %s", (key,)); conn.commit(); return None
    if value is None:
        r = conn.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = %s", (key,)).fetchone()
        return r[0] if r else None
    n = conn.execute("UPDATE nba_config.external_credentials SET credential_value_encrypted = %s, updated_at = now() WHERE credential_key = %s",
                     (value, key)).rowcount
    if not n:
        conn.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES (%s, %s, now())",
                     (key, value))
    conn.commit()
    return value


def setup_browser(sb):
    """location, time zone, language and geolocation permission - every page load after this sees San Diego"""
    for cmd, args in (("Emulation.setGeolocationOverride", {"latitude": LAT, "longitude": LON, "accuracy": 35}),
                      ("Emulation.setTimezoneOverride", {"timezoneId": "America/Los_Angeles"}),
                      ("Emulation.setLocaleOverride", {"locale": "en-US"}),
                      ("Browser.grantPermissions", {"origin": CFG["origin"], "permissions": ["geolocation"]})):
        try:
            sb.driver.execute_cdp_cmd(cmd, args)
        except Exception as exc:  # noqa: BLE001
            print(f"  setup {cmd}: {type(exc).__name__}", flush=True)


FORM_JS = r"""
const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
const lab = e => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || e.id || '').slice(0, 40);
const inputs = [...document.querySelectorAll('input,textarea')].filter(vis).map((e, i) => ({i, type: e.type, label: lab(e),
  auto: e.getAttribute('autocomplete') || '', maxlen: e.maxLength, filled: !!e.value}));
const buttons = [...document.querySelectorAll('button,[role=button],a,input[type=submit]')].filter(vis)
  .map(e => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(t => t);
return {url: location.href, title: document.title, inputs, buttons: [...new Set(buttons)].slice(0, 40),
        text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 600)};
"""


def form(sb, tag):
    try:
        f = sb.execute_script(FORM_JS)
    except Exception as exc:  # noqa: BLE001
        print(f"  [{tag}] form read failed {type(exc).__name__}", flush=True); return {"inputs": [], "buttons": [], "text": "", "url": ""}
    # PUBLIC LOG (the repo is public): no page text and no free button text is printed - only the app's own control words and
    # the tell-tale words found on the page (a name, an e-mail or a balance can never reach the log)
    words = re.compile(r"^(log ?in|sign ?in|login|sign ?up|register|continue|next|submit|verify|confirm|resend.*|send code|"
                       r"use password|forgot password\??|email|phone|password|picks|lobby|cancel|close|back|allow|accept)$", re.I)
    tells = [w for w in ("verification code", "enter the code", "enter code", "one-time", "we sent", "texted", "check your email",
                         "check your phone", "incorrect", "invalid", "too many", "captcha", "not available in your", "location",
                         "verify it's you", "password") if w in (f.get("text") or "").lower()]
    print(f"  [{tag}] url={f['url'].split('?')[0][:90]} title={f['title'][:50]!r}\n     inputs={[(x['type'], x['label'], x['auto']) for x in f['inputs']]}"
          f"\n     controls={[b for b in f['buttons'] if words.match(b)][:25]} (+{sum(1 for b in f['buttons'] if not words.match(b))} other)"
          f"\n     tells={tells}", flush=True)
    return f


def nth_input(sb, i):
    return sb.execute_script("""const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return [...document.querySelectorAll('input,textarea')].filter(vis)[arguments[0]];""", i)


def human_type(sb, i, text, enter=False):
    el = nth_input(sb, i)
    try:
        el.click()
    except Exception:  # noqa: BLE001 - a floating label / overlay takes the click (Sleeper's password field): focus it instead
        sb.execute_script("arguments[0].scrollIntoView({block: 'center'}); arguments[0].focus();", el)
    pause(0.3, 0.8)
    try:
        el.clear()
    except Exception:  # noqa: BLE001
        pass
    for ch in text:
        el.send_keys(ch)
        time.sleep(random.uniform(0.05, 0.19))
    pause()
    if enter:                                  # submit the form the field belongs to (a header 'LOG IN' link is not the form)
        el.send_keys("\n")


def click_text(sb, pattern):
    """click the first visible button / link whose text matches; returns the text clicked"""
    return sb.execute_script(r"""const re = new RegExp(arguments[0], 'i');
      const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      for (const e of document.querySelectorAll('button,[role=button],a,input[type=submit]')) {
        const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').trim();
        if (t && re.test(t) && vis(e) && !e.disabled) { e.click(); return t.slice(0, 40); } }
      return null;""", pattern)


def requests_seen(sb, seen):
    try:
        logs = sb.driver.get_log("performance")
    except Exception:  # noqa: BLE001
        return
    for e in logs:
        try:
            m = json.loads(e["message"])["message"]
        except Exception:  # noqa: BLE001
            continue
        if m.get("method") != "Network.requestWillBeSent":
            continue
        rq = m["params"]["request"]
        u = rq.get("url", "")
        if not any(h in u for h in ("sleeper", "getfliff", "fliff")) or re.search(r"\.(js|css|png|svg|webp|woff2?|ico)(\?|$)", u):
            continue
        op = ""
        try:
            op = json.loads(rq.get("postData") or "{}").get("operationName") or ""
        except Exception:  # noqa: BLE001
            m2 = re.search(r'"__object_class_name"\s*:\s*"(F[A-Z]+__[A-Za-z_]+)"', rq.get("postData") or "")
            op = m2.group(1) if m2 else ""
        key = (rq.get("method"), u.split("?")[0], op)
        if key not in seen:
            seen.add(key)
            print(f"  REQ {key[0]} {key[1][:110]} {op}", flush=True)


def snapshot(sb):
    st = {"localStorage": {}, "cookies": [], "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "app": APP}
    try:
        st["localStorage"] = sb.execute_script("const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); "
                                               "o[k] = localStorage.getItem(k); } return o;") or {}
    except Exception:  # noqa: BLE001
        pass
    try:
        st["cookies"] = sb.driver.get_cookies()
    except Exception:  # noqa: BLE001
        pass
    return st


def signed_in(st):
    """the app keeps its signed-in token in localStorage or a cookie - True when a token-shaped entry is present"""
    for k, v in (st.get("localStorage") or {}).items():
        if TOKENISH.search(k) and v and len(str(v)) > 20:
            return True
        if isinstance(v, str) and re.search(r'"(auth_token|token|access_token|refresh_token)"\s*:\s*"[^"]{20,}', v):
            return True
    return any(TOKENISH.search(c.get("name", "")) and len(str(c.get("value", ""))) > 20 for c in st.get("cookies") or [])


def seed(sb, st):
    for k, v in (st.get("localStorage") or {}).items():
        try:
            sb.execute_script("localStorage.setItem(arguments[0], arguments[1]);", k, v)
        except Exception:  # noqa: BLE001
            pass
    for c in st.get("cookies") or []:
        ck = {kk: c[kk] for kk in ("name", "value", "domain", "path", "secure", "expiry") if kk in c and c[kk] is not None}
        try:
            sb.driver.add_cookie(ck)
        except Exception:  # noqa: BLE001
            pass


def wait_code(conn, sb, seen):
    """LOGIN_CODE_SENT: wait for the owner's code in the credential store, then type it into the code field(s)"""
    print("LOGIN_CODE_SENT|the app asked for a one-time code - waiting for nba_config.external_credentials "
          f"'{APP}_otp' (workflow 'NBA App OTP', or give it to Claude)", flush=True)
    limit = time.time() + int(os.environ.get("APP_OTP_WAIT_S", "900") or "0")
    while time.time() < limit:
        code = cred(conn, f"{APP}_otp")
        if code:
            cred(conn, f"{APP}_otp", delete=True)
            m = re.search(r"(?<!\d)\d{4,8}(?!\d)", code)
            code = m.group(0) if m else code.strip()
            f = form(sb, "code form")
            boxes = [x for x in f["inputs"] if x["type"] in ("text", "tel", "number") and not x["filled"]]
            if len(boxes) >= len(code) and all(x["maxlen"] == 1 for x in boxes[:len(code)]):
                for d, b in zip(code, boxes):
                    human_type(sb, b["i"], d)
            elif boxes:
                human_type(sb, boxes[0]["i"], code)
            pause(1, 2)
            click_text(sb, r"^(verify|continue|submit|confirm|log ?in|sign ?in|next)$")
            time.sleep(8)
            requests_seen(sb, seen)
            return True
        time.sleep(5)
    print("LOGIN_FAIL|no code arrived in time - run again", flush=True)
    return False


def login(conn, sb, seen):
    email = os.environ.get(f"{APP.upper()}_EMAIL", "").strip()
    pw = os.environ.get(f"{APP.upper()}_PASSWORD", "")
    if not email or not pw:
        print(f"LOGIN_FAIL|the GitHub secrets {APP.upper()}_EMAIL / {APP.upper()}_PASSWORD are not set", flush=True); return False
    H.open_alive(sb, CFG["login"], "login page")
    setup_browser(sb)
    time.sleep(6)
    requests_seen(sb, seen)
    f = form(sb, "login page")
    if not any(x["type"] in ("email", "text", "tel", "password") for x in f["inputs"]):
        t = click_text(sb, r"^(log ?in|sign ?in|login)$")
        print(f"  opened the sign-in form via {t!r}", flush=True)
        time.sleep(5)
        f = form(sb, "sign-in form")
    for step in range(4):                      # identifier -> (continue) -> password -> submit, whatever order the app uses
        ident = [x for x in f["inputs"] if x["type"] in ("email", "text", "tel") and not x["filled"]
                 and re.search(r"(mail|phone|user|login|account|identifier)", x["label"] + x["auto"], re.I)]
        pwd = [x for x in f["inputs"] if x["type"] == "password" and not x["filled"]]
        if ident:
            human_type(sb, ident[0]["i"], email)
            print(f"  typed the login into field {ident[0]['label']!r}", flush=True)
        if pwd:
            human_type(sb, pwd[0]["i"], pw, enter=True)
            print("  typed the password and submitted the form", flush=True)
        if not ident and not pwd:
            break
        if not pwd:
            t = click_text(sb, r"^(continue|next|submit|log ?in|sign ?in|login)$")
            print(f"  clicked {t!r}", flush=True)
        time.sleep(7)
        requests_seen(sb, seen)
        f = form(sb, f"after step {step + 1}")
        if pwd:
            break
    low = (f.get("text") or "").lower()
    # a code step = the page now says so, or the password field is gone while a code field is showing (Sleeper keeps a hidden
    # 'login-otp' field in its login form from the start - its presence alone is not a code request)
    pw_gone = not any(x["type"] == "password" and x["auto"] == "current-password" for x in f["inputs"])
    if re.search(r"(verification code|enter (the )?code|one-time|we (sent|texted|emailed)|6-digit|check your (phone|email))", low) or \
            (pw_gone and any(x["auto"] == "one-time-code" or x["maxlen"] == 1 for x in f["inputs"])):
        if not wait_code(conn, sb, seen):
            return False
        f = form(sb, "after code")
    time.sleep(5)
    return True


def main():
    started = time.time()
    if os.environ.get("GITHUB_EVENT_NAME") == "schedule":
        w = random.randint(0, 300)
        print(f"{APP.upper()}_AUTH|human timing: starting in {w} s", flush=True)
        time.sleep(w)
    os.environ["BETR_SESSION_ID"] = CFG["sid"]          # sticky residential session id, fixed per app (same exit every run)
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    seen = set()
    ok = False
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        try:
            with SB(**kw) as sb:
                if not H.open_alive(sb, CFG["home"], "home"):
                    print("LOGIN_FAIL|the proxy never carried the app (net-error page on every reload)", flush=True); sys.exit(4)
                setup_browser(sb)
                H.enable_network(sb)
                stored = cred(conn, f"{APP}_session_state")
                st = json.loads(stored) if stored else {}
                if st:
                    seed(sb, st)
                    H.open_alive(sb, CFG["picks"], "seeded")
                    setup_browser(sb)
                    time.sleep(8)
                    requests_seen(sb, seen)
                    now = snapshot(sb)
                    if signed_in(now):
                        cred(conn, f"{APP}_session_state", json.dumps(now))
                        print(f"{APP.upper()}_SESSION_OK|stored session still signed in; renewed state saved "
                              f"({len(now['localStorage'])} storage keys, {len(now['cookies'])} cookies)", flush=True)
                        ok = True
                    else:
                        print(f"{APP.upper()}_AUTH|stored session is signed out - logging in again", flush=True)
                if not ok:
                    if MODE == "refresh" and os.environ.get("GITHUB_EVENT_NAME") == "schedule" and not os.environ.get(f"{APP.upper()}_PASSWORD"):
                        print("LOGIN_FAIL|signed out and no password secret", flush=True); sys.exit(1)
                    if login(conn, sb, seen):
                        H.open_alive(sb, CFG["picks"], "after login")
                        time.sleep(8)
                        requests_seen(sb, seen)
                        now = snapshot(sb)
                        form(sb, "after login")
                        keys = sorted(now["localStorage"])
                        print(f"  storage keys: {keys[:40]} | cookies: {sorted({c.get('name') for c in now['cookies']})[:40]}", flush=True)
                        if signed_in(now):
                            cred(conn, f"{APP}_session_state", json.dumps(now))
                            print(f"LOGIN_OK|{APP} session stored in external_credentials '{APP}_session_state' "
                                  f"({len(keys)} storage keys, {len(now['cookies'])} cookies)", flush=True)
                            ok = True
                        else:
                            print("LOGIN_FAIL|no signed-in token after the login steps (see the form trail above)", flush=True)
        finally:
            if lp:
                lp.terminate()
    print(f"done in {time.time() - started:.0f} s", flush=True)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
