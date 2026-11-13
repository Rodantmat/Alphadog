#!/usr/bin/env python3
"""AUDIT - Fliff web bundle: look for any way to hand a Pick'Em lineup to the app (deep link, share link, prefill, import slip, saved/draft lineup request). READ-ONLY: bundle files only, no API call, no login."""
import re
import time
import urllib.request
from urllib.parse import urljoin

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
KEYS = ["deeplink", "deep_link", "deepLink", "shareSlip", "share_slip", "SharedSlip", "shared_slip", "copySlip", "copy_slip", "importSlip", "prefill", "Prefill",
        "pickem_share", "betslip_share", "FCM__Save_Slip", "Draft", "saved_slip", "SavedSlip", "load_slip", "getfliff.com/"]


def get(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u, headers={"user-agent": UA, "accept": "*/*"}), timeout=60).read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        print("GET fail", u[:100], str(e)[:80])
        return None


root = "https://sports.getfliff.com/"
h = get(root) or ""
print("root bytes", len(h))
q = [urljoin(root, x) for x in re.findall(r"""<script[^>]+src=["']([^"']+)["']""", h)]
q += [urljoin(root, x) for x in re.findall(r"""["']([^"']*static/js/[^"']+\.js)["']""", h)]
seen, cnt = set(), {}
while q and len(seen) < 220:
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
    for k in KEYS:
        for m in re.finditer(re.escape(k), js):
            cnt[k] = cnt.get(k, 0) + 1
            if cnt[k] <= 4:
                print(f"\n=== [{u.rsplit('/', 1)[-1]}] {k} @ {m.start()}\n{js[max(0, m.start() - 160):m.start() + 420]}", flush=True)
    time.sleep(0.05)
print("\nchunks scanned:", len(seen), "| hits:", cnt)
