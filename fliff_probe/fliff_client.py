#!/usr/bin/env python3
"""FLIFF PROBE - self-contained Fliff public-feed client (2026-10-20).

Separate structure: this folder never imports or edits anything outside fliff_probe/. The protocol is the one the
owner captured on 2026-09-10 (documented in nba/scrape_fliff_board.py, read-only reference):
  POST <host>/fc_mobile_api_public?<header as query>  body {header, invocation:{request:{...}}, x_invocations, x_sb_meta}
  1) FCM__Ping__Request on m-c2 -> data.proposals_feed_endpoint (feed host)
  2) FCM__Public_Feed_Sync__Request code 3054 (initial sync; focused_channel_id -333 = all)
  3) code 3062 with focused_channel_id (a channel's slate) or focused_conflict_fkey (one event's full board)
No login, no location token. Direct first, then the proxy (PROXY_URL) on failure.
"""
import os
import random
import string
import time
from urllib.parse import urlencode

from curl_cffi import requests

PING_HOST = "https://m-c2.app.getfliff.com/"
APP_VERSION = os.environ.get("FLIFF_APP_VERSION", "5.0.35.286")   # fallback only; detect_app_version() reads the live one
_VER_RE = None


def detect_app_version(proxy=None):
    """The live web app's own build: sports.getfliff.com JS carries {marketingVersion:"5.0.35",capNumber:286} -> "5.0.35.286".
    Fliff raised its minimum build on 2026-10-22 (ping error 30040 'This version of the app is no longer supported') - reading
    the version each run keeps the client current. Returns None if it can't be read (the caller keeps APP_VERSION)."""
    import re
    from urllib.parse import urljoin
    s = requests.Session()

    def get(u):
        for px in (None, proxy):
            try:
                r = s.get(u, timeout=45, impersonate="chrome124", proxies={"https": px, "http": px} if px else None)
                if r.status_code == 200:
                    return r.text
            except Exception:  # noqa: BLE001
                pass
        return None
    root = "https://sports.getfliff.com/"
    html = get(root) or ""
    queue = [urljoin(root, x) for x in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html)]
    seen = set()
    pat = re.compile(r'production:\{appName:"Fliff",marketingVersion:"(\d+\.\d+\.\d+)",capNumber:(\d+)\}')
    while queue and len(seen) < 80:
        u = queue.pop(0)
        if u in seen:
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        m = pat.search(js)
        if m:
            return f"{m.group(1)}.{m.group(2)}"
        base = u.rsplit("/", 1)[0] + "/"
        queue += [urljoin(base, x) for x in re.findall(r"""["']([0-9a-zA-Z_.~\-]+\.js)["']""", js)]
    return None
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"


class FliffClient:
    def __init__(self, proxy=None, verbose=True):
        self.s = requests.Session()
        self.proxies = {"https": proxy, "http": proxy} if proxy else None
        self.verbose = verbose
        dev = "web." + "".join(random.choices("0123456789abcdef", k=32))
        tok = "".join(random.choices(string.ascii_letters + string.digits, k=10))
        self.hdr = {"product_code": 10, "device_x_id": dev, "app_x_version": APP_VERSION, "app_install_token": tok,
                    "auth_token": "", "conn_id": 1, "platform": "prod", "usa_state_code": "",
                    "usa_state_code_source": "ipOrigin=2702|regionCode=|meta=|geocodeOrigin=2702|regionCode=|meta=",
                    "xtag": "", "country_code": "", "af_uid": "no_appsflyer_uid_for_web", "location_token": ""}
        self.feed_host = None
        self.ping_data = {}
        self.calls = 0

    def _post(self, host, request_obj):
        url = host.rstrip("/") + "/fc_mobile_api_public?" + urlencode(self.hdr)
        body = {"header": self.hdr, "invocation": {"request": request_obj}, "x_invocations": None,
                "x_sb_meta": {"sb_config_version": -1, "sb_user_profile_version": -1, "sb_user_profile_meta": None,
                              "campaigns_meta": {"all_visible_campaigns_keys": {}}}}
        hdrs = {"accept": "application/json, text/plain, */*", "content-type": "application/json",
                "origin": "https://sports.getfliff.com", "referer": "https://sports.getfliff.com/", "user-agent": UA}
        last = None
        for attempt in range(3):
            for route in ("direct", "proxy"):
                if route == "proxy" and not self.proxies:
                    continue
                try:
                    r = self.s.post(url, json=body, headers=hdrs, timeout=60, impersonate="chrome124",
                                    proxies=self.proxies if route == "proxy" else None)
                    self.calls += 1
                    if r.status_code != 200:
                        last = f"http {r.status_code}"
                        continue
                    j = r.json()
                    if isinstance(j, dict) and (j.get("result") or {}).get("error"):
                        last = f"api error {str(j['result']['error'])[:160]}"
                        continue
                    return j
                except Exception as exc:  # noqa: BLE001
                    last = f"{type(exc).__name__}: {str(exc)[:120]}"
            time.sleep(min(12, 2 ** attempt + random.random()))
        raise RuntimeError(f"fliff call failed after retries: {last}")

    def ping(self):
        j = self._post(PING_HOST, {"__object_class_name": "FCM__Ping__Request", "message": f"ping {int(time.time() * 1000)}"})
        self.ping_data = ((j.get("result") or {}).get("response") or {}).get("data") or {}
        self.feed_host = self.ping_data.get("proposals_feed_endpoint") or "https://herald-2.app.getfliff.com/"
        return j

    def sync(self, code, channel=-333, conflict=""):
        if not self.feed_host:
            self.ping()
        req = {"__object_class_name": "FCM__Public_Feed_Sync__Request", "code": code,
               "subfeed_meta": {"packed_subfeed_revisions": [], "focused_channel_id": channel,
                                "focused_conflict_fkey": conflict, "focused_player_fkey": "",
                                "focused_ticket_conflict_fkeys": [], "focused_ticket_proposal_fkeys": [],
                                "focused_ticket_data": []}}
        return self._post(self.feed_host, req)


def walk(obj, fn, path=()):
    """Visit every dict node: fn(node, path)."""
    if isinstance(obj, dict):
        fn(obj, path)
        for k, v in obj.items():
            walk(v, fn, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, fn, path + (i,))


def lists_under(obj, key_name):
    """Every list found under a key == key_name, recursively."""
    out = []

    def fn(node, _):
        v = node.get(key_name)
        if isinstance(v, list):
            out.append(v)
    walk(obj, fn)
    return out


def conflicts_of(j):
    xs = (j or {}).get("x_slots") or {}
    return list(xs.get("active_prematch_conflicts") or []), list(xs.get("active_inplay_conflicts") or [])
