#!/usr/bin/env python3
"""
PROBE - HOW SLEEPER AND FLIFF SIGN A USER IN, FROM THEIR OWN WEB APPS (2026-10-25; owner 22:55 PT: "I'll save my password and user on
a secret, same way we did with underdog, if it needs a code by email or phone we create a rule to do so, for each app").
READ-ONLY: only the apps' public static JS files are downloaded; no login is attempted, nothing is sent to an auth endpoint.
Prints, per app, the code around every sign-in token (login / sign in / password / captcha / one-time code / refresh token / auth
endpoint), so the login worker can be written exactly as each web app does it (the Underdog login was built the same way).
Env: PROXY_URL (fallback route).
"""
import os
import re
from collections import deque
from urllib.parse import urljoin

from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
PROXY = (os.environ.get("PROXY_URL") or "").strip() or None
APPS = {
    "sleeper": {"pages": ["https://sleeper.com/login", "https://sleeper.com/picks"],
                "kw": r"(mutation [a-z_]*login[a-z_]*|login_by_password|login_by_code|mutation user\b|send_login_code|verify_login|captcha|"
                      r"recaptcha|hcaptcha|turnstile|sitekey|refresh_token|x-sleeper|authorization:|Authorization|graphql\"|/graphql|"
                      r"email_or_phone|phone_or_email|one_time|otp|verification_code|two_factor|2fa)"},
    "fliff": {"pages": ["https://sports.getfliff.com/", "https://sports.getfliff.com/login", "https://app.getfliff.com/"],
              "kw": r"(FCM__[A-Za-z_]*(Login|Sign|Auth|Otp|Verif|Password|Session|Token)[A-Za-z_]*__Request|auth_token|refresh_token|"
                    r"signInWith|sign_in|signin|/auth/|oauth|firebase|identitytoolkit|recaptcha|password|one_time|otp_code|verification_code|"
                    r"sms_code|phone_code|magic_link)"},
}


def get(s, u):
    for px in (None, PROXY):
        try:
            r = s.get(u, headers=UA, timeout=45, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
            if r.status_code == 200:
                return r.text
        except Exception:  # noqa: BLE001
            pass
        if not PROXY:
            break
    return None


def scan(app, cfg):
    s = requests.Session()
    q, seen, hits = deque(), set(), []
    for p in cfg["pages"]:
        h = get(s, p) or ""
        print(f"[{app}] page {p}: {len(h)} chars", flush=True)
        for m in re.findall(r"""(?:src|href)=["']([^"']+\.js[^"']*)["']""", h) + re.findall(r"""["']((?:https://[a-z0-9.\-]+)?/[A-Za-z0-9_\-/.~]*static/[A-Za-z0-9_\-/.~]+?\.js)["']""", h):
            u = urljoin(p, m)
            if u not in seen:
                seen.add(u); q.append(u)
    kw = re.compile(cfg["kw"], re.I)
    n = 0
    while q and n < 400:
        u = q.popleft()
        js = get(s, u)
        n += 1
        if not js:
            continue
        base = u.split("?")[0].rsplit("/", 1)[0] + "/"
        for m in re.findall(r"""["']((?:static/(?:js|chunks)/)?[0-9A-Za-z_\-~.]{6,60}\.(?:chunk\.)?js)["']""", js):
            v = urljoin(base, m) if not m.startswith("static/") else urljoin(u.split("/static/")[0] + "/", m)
            if v not in seen and ("getfliff" in v or "sleeper" in v):
                seen.add(v); q.append(v)
        c = 0
        for m in kw.finditer(js):
            if c >= 20:
                break
            hits.append((u.rsplit("/", 1)[-1][:40], m.group(0), re.sub(r"\s+", " ", js[max(0, m.start() - 300):m.start() + 500])))
            c += 1
    print(f"[{app}] chunks {n}, hits {len(hits)}", flush=True)
    done = set()
    for name, k, ctx in hits:
        key = (k.lower(), ctx[280:360])
        if key in done:
            continue
        done.add(key)
        if '":"' in ctx[250:350] and ctx.count('":"') > 5:          # translation string tables
            continue
        print(f"\n[{app}][{name}] {k}\n  {ctx}", flush=True)
        if len(done) > 160:
            break


def main():
    for app, cfg in APPS.items():
        scan(app, cfg)


if __name__ == "__main__":
    main()
