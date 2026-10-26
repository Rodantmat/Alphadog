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
PRE = [True]                                   # True until the sign-in steps end


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
const vis = e => { if (e.checkVisibility && !e.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false; if (e.closest('[aria-hidden=true],[inert]')) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
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
    words = re.compile(r"^(log ?in|sign ?in|login|sign ?up|register|continue|next|submit|verify|confirm|resend.*|send( (a |the )?code)?|"
                       r"get( a)? code|text me.*|email me.*|call me.*|(log ?in|sign ?in) with (a )?(password|code|email|phone|text)|"
                       r"use (a |my )?(password|code|email|phone).*|.*password instead|.*code instead|forgot password\??|email|phone|"
                       r"password|picks|lobby|cancel|close|back|allow|accept|ok|got it|skip|not now|later)$", re.I)
    tells = [w for w in ("verification code", "enter the code", "enter code", "one-time", "we sent", "texted", "check your email",
                         "sent a code", "sent you", "send a code", "code to", "6 digit", "6-digit", "login code", "magic link",
                         "check your phone", "incorrect", "invalid", "too many", "captcha", "not available in your", "location",
                         "verify it's you", "password") if w in (f.get("text") or "").lower()]
    print(f"  [{tag}] url={f['url'].split('?')[0][:90]} title={f['title'][:50]!r}\n     inputs={[(x['type'], x['label'], x['auto']) for x in f['inputs']]}"
          f"\n     controls={[b for b in f['buttons'] if words.match(b)][:25]} (+{sum(1 for b in f['buttons'] if not words.match(b))} other)"
          f"\n     tells={tells}", flush=True)
    if PRE[0]:                                 # before sign-in the form holds no personal data: list every button (scrubbed)
        print(f"     all buttons={[_scrub(b)[:25] for b in f['buttons']]}", flush=True)
    return f


def nth_input(sb, i):
    return sb.execute_script("""const vis = e => { if (e.checkVisibility && !e.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false; if (e.closest('[aria-hidden=true],[inert]')) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
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
      const vis = e => { if (e.checkVisibility && !e.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false; if (e.closest('[aria-hidden=true],[inert]')) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
      for (const e of document.querySelectorAll('button,[role=button],a,input[type=submit]')) {
        const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').trim();
        if (t && re.test(t) && vis(e) && !e.disabled) { e.click(); return t.slice(0, 40); } }
      return null;""", pattern)


def _scrub(t):
    """PUBLIC LOG: no e-mail, phone, id or token can pass - only words"""
    t = re.sub(r"\S+@\S+", "<email>", str(t))
    t = re.sub(r"[A-Za-z0-9_\-]{24,}", "<long>", t)
    return re.sub(r"\d{3,}", "<num>", t)[:120]


def _shape(v, d=0):
    """the answer's structure: keys, value TYPES, booleans and error messages (scrubbed) - never a value"""
    if isinstance(v, dict):
        return {k: (_scrub(x) if k in ("message", "code", "reason", "type", "__typename") and isinstance(x, str) else _shape(x, d + 1))
                for k, x in list(v.items())[:25]} if d < 5 else "{..}"
    if isinstance(v, list):
        return [_shape(v[0], d + 1), f"len={len(v)}"] if v else []
    if isinstance(v, bool) or v is None:
        return v
    return type(v).__name__


def requests_seen(sb, seen):
    try:
        logs = sb.driver.get_log("performance")
    except Exception:  # noqa: BLE001
        return
    gql = {}
    for e in logs:
        try:
            m = json.loads(e["message"])["message"]
        except Exception:  # noqa: BLE001
            continue
        meth, pr = m.get("method"), m.get("params") or {}
        if meth == "Network.responseReceived" and pr.get("requestId") in gql:
            gql[pr["requestId"]]["status"] = (pr.get("response") or {}).get("status")
            continue
        if meth == "Network.loadingFinished" and pr.get("requestId") in gql:
            gql[pr["requestId"]]["done"] = True
            continue
        if meth != "Network.requestWillBeSent":
            continue
        rq = pr["request"]
        u = rq.get("url", "")
        if not any(h in u for h in ("sleeper", "getfliff", "fliff")) or re.search(r"\.(js|css|png|svg|webp|woff2?|ico)(\?|$)", u):
            continue
        op, pd = "", rq.get("postData") or ""
        try:
            j = json.loads(pd or "{}")
            q = j.get("query") or ""
            mm = re.search(r"\b(query|mutation)\s*(\w*)[^{]*\{\s*(\w+)", q)
            op = j.get("operationName") or (f"{mm.group(1)} {mm.group(2) or '-'} -> {mm.group(3)}" if mm else "")
            if q:
                op += f" vars={sorted((j.get('variables') or {}).keys())}"
        except Exception:  # noqa: BLE001
            m2 = re.search(r'"__object_class_name"\s*:\s*"(F[A-Z]+__[A-Za-z_]+)"', pd)
            op = m2.group(1) if m2 else ""
        if "graphql" in u and rq.get("method") == "POST":
            gql[pr.get("requestId")] = {"op": op}
        key = (rq.get("method"), u.split("?")[0], op)
        if key not in seen:
            seen.add(key)
            print(f"  REQ {key[0]} {key[1][:110]} {op}", flush=True)
    for rid, g in gql.items():                 # what the app's server answered to each sign-in call (structure only)
        try:
            body = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid}).get("body") or ""
            sh = _shape(json.loads(body))
        except Exception as exc:  # noqa: BLE001
            sh = f"(body n/a {type(exc).__name__})"
        print(f"  ANS {g.get('status')} {g['op'][:80]} => {json.dumps(sh)[:700]}", flush=True)


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
            boxes = [x for x in f["inputs"] if x["auto"] == "one-time-code" and not x["filled"]] or \
                    [x for x in f["inputs"] if x["type"] in ("text", "tel", "number") and not x["filled"]
                     and not re.search(r"(mail|phone|user)", x["label"] + x["auto"], re.I)]
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
    typed_ident = False
    for step in range(4):                      # identifier -> (continue) -> password -> submit, whatever order the app uses
        pwd = [x for x in f["inputs"] if x["type"] == "password" and not x["filled"]]
        if typed_ident and not pwd and any(x["auto"] == "one-time-code" for x in f["inputs"]):
            break                              # the app answered the login with a code step (Sleeper: login -> code), no password
        ident = [] if typed_ident else [x for x in f["inputs"] if x["type"] in ("email", "text", "tel") and not x["filled"]
                                         and re.search(r"(mail|phone|user|login|account|identifier)", x["label"] + x["auto"], re.I)]
        if ident and not pwd:                  # a two-step form (Sleeper): the login first, Enter, then the password page
            human_type(sb, ident[0]["i"], email, enter=True)
            typed_ident = True
            print(f"  typed the login into field {ident[0]['label']!r} and pressed Enter", flush=True)
        elif ident:
            human_type(sb, ident[0]["i"], email)
            typed_ident = True
            print(f"  typed the login into field {ident[0]['label']!r}", flush=True)
        if pwd:
            try:
                human_type(sb, pwd[0]["i"], pw, enter=True)
                print("  typed the password and submitted the form", flush=True)
            except Exception as exc:  # noqa: BLE001 - the password page is not up yet: submit the login step and look again
                print(f"  password field not ready ({type(exc).__name__}) - submitting the login step first", flush=True)
                pwd = []
                if ident:
                    try:
                        nth_input(sb, ident[0]["i"]).send_keys("\n")
                    except Exception:  # noqa: BLE001
                        click_text(sb, r"^(continue|next)$")
        if not ident and not pwd:
            break
        time.sleep(7)
        requests_seen(sb, seen)
        f = form(sb, f"after step {step + 1}")
        if pwd:
            break
        if typed_ident and not any(x["type"] == "password" for x in f["inputs"]) and not re.search(
                r"(we sent|sent (a|you)|enter (the )?code|verification|check your)", (f.get("text") or "").lower()):
            # Enter did not move the form on: press the form's own submit button (the one inside the login form, not the header)
            t = sb.execute_script(r"""const i = [...document.querySelectorAll('input[autocomplete=username]')].pop();
              const fm = i && (i.closest('form') || i.parentElement.parentElement.parentElement);
              if (!fm) return null;
              const b = [...fm.querySelectorAll('button,[role=button],input[type=submit]')].filter(e => !e.disabled).pop();
              if (!b) return null; b.click(); return (b.innerText || b.value || b.getAttribute('aria-label') || '<icon>').trim().slice(0, 25);""")
            print(f"  form did not advance - pressed the login form's own button {_scrub(t) if t else None!r}", flush=True)
            if t:
                time.sleep(7)
                requests_seen(sb, seen)
                f = form(sb, f"after form button {step + 1}")
    low = (f.get("text") or "").lower()
    # a code step = the page now says so, or the password field is gone while a code field is showing (Sleeper keeps a hidden
    # 'login-otp' field in its login form from the start - its presence alone is not a code request)
    pw_gone = typed_ident and not any(x["type"] == "password" and x["auto"] == "current-password" for x in f["inputs"])
    if pw_gone and any(x["auto"] == "one-time-code" for x in f["inputs"]):
        t = click_text(sb, r"^((log ?in|sign ?in) with (a )?password|use (a |my )?password.*|.*password instead|enter (your )?password)$")
        if t:                                  # the password route is preferred (the unattended renew can use it)
            print(f"  code step offers a password route - clicked {t!r}", flush=True)
            time.sleep(5)
            f = form(sb, "password route")
            pwd = [x for x in f["inputs"] if x["type"] == "password" and not x["filled"]]
            if pwd:
                human_type(sb, pwd[0]["i"], pw, enter=True)
                print("  typed the password and submitted the form", flush=True)
                time.sleep(7)
                requests_seen(sb, seen)
                f = form(sb, "after password")
                low = (f.get("text") or "").lower()
                pw_gone = False
        else:
            t = click_text(sb, r"^(send( (a |the )?code)?|get( a)? code|text me.*|email me.*)$")
            if t:
                print(f"  clicked {t!r} to have the code sent", flush=True)
                time.sleep(5)
                f = form(sb, "code requested")
                low = (f.get("text") or "").lower()
    said = re.search(r"(verification code|enter (the )?code|one-time|we (sent|texted|emailed)|6-digit|check your (phone|email)|sent (a|you))", low)
    if not said and pw_gone:                   # no page says a code was sent: a short wait only (the code field may be a leftover)
        os.environ["APP_OTP_WAIT_S"] = str(min(int(os.environ.get("APP_OTP_WAIT_S", "900") or "0"), 240))
        print("  no 'code sent' text on the page - waiting 240 s at most", flush=True)
    if said or (pw_gone and any(x["auto"] == "one-time-code" or x["maxlen"] == 1 for x in f["inputs"])):
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
