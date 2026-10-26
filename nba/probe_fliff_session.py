#!/usr/bin/env python3
"""
PROBE - FLIFF SIGNED-IN SESSION, STEP 1: HOW FLIFF'S WEB APP REFRESHES ITS TOKEN AND WHICH READ-ONLY SIGNED-IN CALLS EXIST
(2026-10-26; owner 12:17 PT "Now we will figure it fliff, the token then the strategy"; the owner signed in on his own browser - phone
code, his own location check - and handed over the session from its storage, kept ONLY in the private credential 'fliff_session').
THIS STEP SENDS NOTHING SIGNED: it reads Fliff's public web code (sports.getfliff.com and its chunks) and prints the code around
  - the token refresh (refresh_token / grant_type / oauth / @refreshToken / tokensRefreshCount / fc_mobile_api_private),
  - the signed-in request classes (FCM__*__Request names mentioning Token, Refresh, Login, Ticket, History, Activity, Profile, Pick,
    Skipper, Parlay) - the names only, so step 2 can send ONE read-only refresh and ONE read of the owner's own Pick'Em history.
Never: Place_ / Cashout / Withdraw / Deposit / any write. Env: PROXY_URL (optional).
"""
import os
import re
import sys
import time
from urllib.parse import urljoin

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fliff_probe"))
from fliff_client import FliffClient  # noqa: E402

PROXY = os.environ.get("PROXY_URL", "").strip() or None
CTX = re.compile(r"(\"refresh_token\"|grant_type:\"refresh_token\"|x-dd-refresh-token|coreServerClientId[=:]|coreServerBaseUrl|coreServer[A-Za-z]*Url|"
                 r"toValidUserFkey[=(]|fc_mobile_api_private|class [A-Za-z_$]+ extends [A-Za-z_$.]+\{static CLASS_NAME=\"FCM__Skipper_Get_Settled_Entries_Report__Request|"
                 r"FCM__Skipper_Get_Settled_Entries_Report__Request|FCM__Skipper_Get_Active_Entries_Report__Request|FCM__Get_Picks_Report__Request)")
SECRET = re.compile(r"(?i)(secret[\"']?\s*[:=]\s*[\"'])([^\"']{6,})([\"'])")
CLS = re.compile(r"FCM__[A-Za-z0-9_]+__(?:Request|Response)")
KEEP = re.compile(r"(Token|Refresh|Login|Auth|Ticket|History|Activity|Profile|Pick|Skipper|Parlay|Slip|Account|Wager|Bet)", re.I)


def main():
    fc = FliffClient(proxy=PROXY, verbose=False)
    s = fc.s

    def get(u):
        for px in (None, PROXY):
            try:
                r = s.get(u, timeout=60, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
                if r.status_code == 200:
                    return r.text
            except Exception:  # noqa: BLE001
                pass
        return None

    root = "https://sports.getfliff.com/"
    h = get(root) or ""
    q = [urljoin(root, x) for x in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", h)]
    q += [urljoin(root, x) for x in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", h)]
    seen, ctx, classes = set(), [], set()
    while q and len(seen) < 200:
        u = q.pop(0)
        if u in seen or not u.endswith(".js"):
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        base = u.split("/static/")[0] + "/"
        for m in re.findall(r"""["']((?:static/js/)?[0-9a-zA-Z_.\-]+\.chunk\.js)["']""", js):
            q.append(urljoin(base, m if m.startswith("static/") else "static/js/" + m))
        for m in re.findall(r"""["']([0-9a-zA-Z_.\-/]+\.js)["']""", js):
            if "static/js" in m or m.endswith(".chunk.js"):
                q.append(urljoin(base, m))
        classes |= {c for c in CLS.findall(js) if KEEP.search(c)}
        n = 0
        for m in CTX.finditer(js):
            if n >= 12:
                break
            ctx.append((u.rsplit("/", 1)[-1], m.group(0), js[max(0, m.start() - 600):m.start() + 900].replace("\n", " ")))
            n += 1
        time.sleep(0.1)
    print(f"bundle: {len(seen)} files, {len(ctx)} token-code mentions, {len(classes)} signed-in-looking classes", flush=True)
    print("\nCLASSES:\n  " + "\n  ".join(sorted(classes)), flush=True)
    done = set()
    for name, kw, c in ctx:
        k = c[500:700]
        if k in done:
            continue
        done.add(k)
        print(f"\n[{name}] {kw}\n  {c}", flush=True)


if __name__ == "__main__":
    main()
