#!/usr/bin/env python3
"""FLIFF PROBE - WEB BUNDLE SCAN (read-only; 2026-10-21 00:05 PT).

Why: the pick'em ladder (alternate player lines) is not on the herald feed (3062 + focused_player_fkey returns one line per
player). The ping lists skipper_public_feed_endpoint, which answers FCM__Public_Feed_Sync__Request with error 30503
"unknown invocation" - it speaks another request class. Instead of guessing names, read them from Fliff's own web app:
download https://sports.getfliff.com (and app.getfliff.com) + every JS chunk it references, extract every FCM__/FM__ class
name, every object-class string near skipper / alt prop / pick'em words, and short context windows. Output:
fliff_probe/out/discovery_bundle.json.
"""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin

from curl_cffi import requests

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
PROXY = os.environ.get("PROXY_URL", "").strip() or None
WORDS = re.compile(r"(skipper|alt_?prop|AltProp|alternate|pick_?em|PickEm|flex_?play|ladder|Superstar)", re.I)
CLASS = re.compile(r"\b(F[A-Z]{1,4}__[A-Za-z0-9_]{3,80})\b")


def get(url):
    for route in ("direct", "proxy"):
        if route == "proxy" and not PROXY:
            continue
        try:
            r = S.get(url, timeout=60, impersonate="chrome124", proxies={"https": PROXY, "http": PROXY} if route == "proxy" else None)
            if r.status_code == 200:
                return r.text
        except Exception:  # noqa: BLE001
            pass
    return None


def main():
    rep = {"pages": {}, "chunks": [], "classes": {}, "skipper_context": [], "feed_sync_context": []}
    seen, queue = set(), []
    for root in ("https://sports.getfliff.com/", "https://app.getfliff.com/", "https://www.getfliff.com/"):
        html = get(root)
        rep["pages"][root] = len(html or "")
        if not html:
            continue
        for src in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", html):
            queue.append(urljoin(root, src))
        for src in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", html):
            queue.append(urljoin(root, src))
    classes = {}
    while queue and len(seen) < 120:
        u = queue.pop(0)
        if u in seen or not u.endswith(".js"):
            continue
        seen.add(u)
        js = get(u)
        if not js:
            continue
        rep["chunks"].append({"url": u, "bytes": len(js)})
        # webpack chunk map -> more chunks
        base = u.rsplit("/", 1)[0] + "/"
        for m in re.findall(r"""["']((?:static/js/)?[0-9a-zA-Z_.\-]+\.chunk\.js)["']""", js):
            queue.append(urljoin(base, m) if "/" not in m else urljoin(u.split("/static/")[0] + "/", m))
        for m in CLASS.findall(js):
            classes[m] = classes.get(m, 0) + 1
        for mm in WORDS.finditer(js):
            s = max(0, mm.start() - 160)
            ctx = js[s: mm.end() + 220].replace("\n", " ")
            if CLASS.search(ctx) or "code" in ctx:
                rep["skipper_context"].append({"chunk": u.rsplit("/", 1)[-1], "word": mm.group(0), "ctx": ctx})
        for mm in re.finditer(r"Public_Feed_Sync|Feed_Sync__Request|focused_player_fkey|subfeed_meta", js):
            s = max(0, mm.start() - 250)
            rep["feed_sync_context"].append({"chunk": u.rsplit("/", 1)[-1], "ctx": js[s: mm.end() + 350].replace("\n", " ")})
        time.sleep(0.2)
    rep["classes"] = dict(sorted(classes.items()))
    rep["skipper_context"] = rep["skipper_context"][:400]
    rep["feed_sync_context"] = rep["feed_sync_context"][:80]
    interesting = {k: v for k, v in classes.items() if re.search(r"(Skipper|Alt|Pick|Flex|Prop|Feed|Sync|Ladder|Superstar|Player)", k, re.I)}
    rep["interesting_classes"] = interesting
    print("pages:", rep["pages"], "| chunks:", len(rep["chunks"]), "| classes:", len(classes), flush=True)
    print("interesting classes:", json.dumps(interesting)[:3000], flush=True)
    (OUT / "discovery_bundle.json").write_text(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
