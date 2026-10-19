#!/usr/bin/env python3
"""
PROBE - WHERE SLEEPER'S NBA "ALT STAT" LADDER COMES FROM NOW (2026-10-18; owner screenshot 23:18 PT: Embiid 2+ BLK 2.55x, 3+ BLK
5.26x, 2+ STL 4.32x under "ALT STAT"). Our scraper's lines/available_alt?sports[]=nba returned 0 markets at 06:22 UTC while the app
shows the rungs. Read-only, no login: opens sleeper.com/picks in a real Chrome (residential proxy), reads every JS bundle through CDP
(Page.getResourceContent) for api.sleeper.app paths containing line / alt / ladder, and logs every api.sleeper.app request the page
makes for 40 s (path + query), plus the first 600 chars of any response mentioning alt.
Env: PROXY_URL.
"""
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import betr_harvest_cloud as H  # noqa: E402  (proxy helper only)
from seleniumbase import SB  # noqa: E402

PATH_RE = re.compile(r"[\"'`](/?(?:lines|picks|v1/picks|graphql)[A-Za-z0-9_\-/{}$.?=&\[\]%]*)[\"'`]")
HOST_RE = re.compile(r"https://api\.sleeper\.app/[A-Za-z0-9_\-/{}$.?=&\[\]%]*")


def main():
    lp, proxy_arg = H.start_local_proxy()
    kw = dict(uc=True, xvfb=True, locale="en-US", incognito=True, log_cdp_events=True)
    if proxy_arg:
        kw["proxy"] = proxy_arg
    with SB(**kw) as sb:
        sb.uc_open_with_reconnect("https://sleeper.com/picks", 8)
        H.enable_network(sb)
        time.sleep(8)
        print("at", sb.get_current_url(), repr(sb.get_title()), flush=True)
        try:
            tree = sb.driver.execute_cdp_cmd("Page.getResourceTree", {})
            frame = tree["frameTree"]["frame"]["id"]
            res = [r["url"] for r in tree["frameTree"].get("resources", []) if r.get("type") == "Script"]
        except Exception as exc:  # noqa: BLE001
            print("resource tree failed", exc, flush=True)
            frame, res = None, []
        print(f"bundles {len(res)}", flush=True)
        paths, hits = set(), []
        for u in res:
            try:
                c = sb.driver.execute_cdp_cmd("Page.getResourceContent", {"frameId": frame, "url": u})
            except Exception:  # noqa: BLE001
                continue
            t = c.get("content") or ""
            for m in PATH_RE.finditer(t):
                paths.add(m.group(1))
            for m in HOST_RE.finditer(t):
                paths.add(m.group(0))
            for m in re.finditer(r"available_alt|alt_lines|altLines|alternate|ALT STAT|alt_stat|ladder", t):
                if len(hits) < 60:
                    hits.append(re.sub(r"\s+", " ", t[max(0, m.start() - 200):m.start() + 250]))
        print("API PATHS:", flush=True)
        for p in sorted(paths):
            if re.search(r"line|alt|pick|ladder", p, re.I):
                print("  ", p, flush=True)
        print("ALT MENTIONS:", flush=True)
        for h in hits:
            print("  ", h, flush=True)
        # the page's own calls
        seen, ids = set(), {}
        t_end = time.time() + 40
        while time.time() < t_end:
            try:
                logs = sb.driver.get_log("performance")
            except Exception:  # noqa: BLE001
                logs = []
            for e in logs:
                try:
                    m = json.loads(e["message"])["message"]
                except Exception:  # noqa: BLE001
                    continue
                if m.get("method") == "Network.requestWillBeSent":
                    u = m["params"]["request"].get("url", "")
                    if "sleeper.app" in u and u not in seen:
                        seen.add(u)
                        print("REQ", m["params"]["request"].get("method"), u[:300], flush=True)
                        ids[m["params"]["requestId"]] = u
            time.sleep(2)
        for rid, u in ids.items():
            try:
                b = sb.driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": rid}).get("body") or ""
            except Exception:  # noqa: BLE001
                continue
            if re.search(r"alt", u + b[:200000], re.I):
                print(f"RESP {u[:200]} {len(b)}b {b[:600]}", flush=True)
    if lp:
        lp.terminate()
    # direct calls through the proxy: the alt endpoint variants
    proxy = os.environ.get("PROXY_URL", "").strip()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": proxy, "http": proxy})) if proxy else urllib.request.build_opener()
    for url in ("https://api.sleeper.app/lines/available_alt?include_preseason=true&sports%5B%5D=nba",
                "https://api.sleeper.app/lines/available_alt?sports%5B%5D=nba",
                "https://api.sleeper.app/lines/available_alt",
                "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true&include_alt_lines=true"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with opener.open(req, timeout=40) as r:
                body = r.read().decode("utf-8", "replace")
            j = json.loads(body)
            sports = {}
            if isinstance(j, list):
                for ln in j:
                    for o in (ln.get("options") or [])[:1]:
                        sports[o.get("sport")] = sports.get(o.get("sport"), 0) + 1
            alt_types = {}
            if isinstance(j, list):
                for ln in j:
                    for o in (ln.get("options") or [])[:1]:
                        if o.get("sport") == "nba":
                            alt_types[str(o.get("line_type"))] = alt_types.get(str(o.get("line_type")), 0) + 1
            print(f"DIRECT {url} -> {len(body)}b, by sport {sports}, nba line_types {alt_types}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"DIRECT {url} -> {type(exc).__name__}: {str(exc)[:150]}", flush=True)


if __name__ == "__main__":
    main()
