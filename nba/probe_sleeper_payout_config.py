#!/usr/bin/env python3
"""
PROBE (2026-10-09, owner: "you can also probe the apps for everything") - where does Sleeper state how an entry's payout
is formed from its picks' multipliers? The help centre gives no formula (Player Picks Rules / Combo Contests, fetched
2026-10-09): Max = all hit, Flex = lower perfect payout + one-miss (3+) / two-miss (5+) payouts, minimum Flex 1.25x.
This probe looks for the machine-readable answer: (1) every key in the public lines endpoints whose name smells like
payout / flex / contest / config; (2) candidate config endpoints; (3) the web app's JS bundles, grepped for the payout
schedule constants (flex tables, multiplier product, caps). Prints only key names, small values and short code snippets.
No credentials involved (all public, read-only).
"""
import os
import re

from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "*/*", "Referer": "https://sleeper.com/"}
PROXY = os.environ.get("PROXY_URL", "").strip()
PROXIES = {"https": PROXY, "http": PROXY} if PROXY else None
SMELL = re.compile(r"payout|flex|contest|config|schedule|multiplier|max_|min_|cap|boost|tier|combo|entry", re.I)


def get(url, binary=False, tries=2):
    last = None
    for i in range(tries):
        for use_proxy in (False, True):
            try:
                r = requests.get(url, headers=UA, timeout=60, impersonate="chrome124", proxies=PROXIES if (use_proxy and PROXIES) else None)
                if r.status_code == 200:
                    return r
                last = f"http {r.status_code}"
            except Exception as exc:  # noqa: BLE001
                last = f"{type(exc).__name__}: {str(exc)[:60]}"
    print(f"  {url} -> {last}")
    return None


def walk(x, path, found, depth=0):
    if depth > 6:
        return
    if isinstance(x, dict):
        for k, v in x.items():
            p = f"{path}.{k}"
            if SMELL.search(k) and not isinstance(v, (dict, list)):
                found.setdefault(p, set()).add(str(v)[:40])
            elif SMELL.search(k):
                found.setdefault(p, set()).add(f"<{type(v).__name__}>")
            walk(v, p, found, depth + 1)
    elif isinstance(x, list):
        for v in x[:200]:
            walk(v, path + "[]", found, depth + 1)


def main():
    print("== 1. public lines endpoints: keys that smell like payout / flex / contest / config")
    for name, url in (("available", "https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true"),
                      ("available_alt", "https://api.sleeper.app/lines/available_alt?include_preseason=true"),
                      ("promos", "https://api.sleeper.app/lines/promos?enable_one_sided_lines=true")):
        r = get(url)
        if r is None:
            continue
        try:
            j = r.json()
        except Exception:  # noqa: BLE001
            print(f"  {name}: not json ({len(r.content)} bytes)"); continue
        found = {}
        walk(j, name, found)
        top = list(j.keys())[:30] if isinstance(j, dict) else f"list[{len(j)}] first keys {list(j[0].keys())[:30] if j and isinstance(j[0], dict) else '?'}"
        print(f"  {name}: {len(r.content)} bytes; top: {top}")
        for p in sorted(found)[:60]:
            vals = sorted(found[p])[:6]
            print(f"    {p}: {vals}")

    print("== 2. candidate config endpoints (public?)")
    for url in ("https://api.sleeper.app/lines/config", "https://api.sleeper.app/picks/config", "https://api.sleeper.app/lines/payouts",
                "https://api.sleeper.app/lines/payout_config", "https://api.sleeper.app/picks/payout_config", "https://api.sleeper.app/lines/contests",
                "https://api.sleeper.app/picks/contests", "https://api.sleeper.app/v1/picks/config", "https://api.sleeper.app/lines/multipliers",
                "https://api.sleeper.app/lines/available?dynamic=true&include_config=true"):
        r = get(url, tries=1)
        if r is not None:
            body = r.text
            print(f"  {url} -> 200, {len(body)} bytes: {body[:300]!r}")

    print("== 3. web app bundles: payout schedule constants")
    r = get("https://sleeper.com/picks")
    if r is None:
        r = get("https://sleeper.com/")
    if r is None:
        print("  no web app html"); return
    html = r.text
    srcs = sorted(set(re.findall(r'src="([^"]+\.js[^"]*)"', html)))
    print(f"  html {len(html)} bytes, {len(srcs)} script tags")
    hits = 0
    key_pat = re.compile(r"(flex|payout|multiplier)[A-Za-z_]*\s*[:=]\s*(\[[^\]]{0,200}\]|\{[^}]{0,300}\}|[0-9.]+)", re.I)
    for s in srcs[:40]:
        u = s if s.startswith("http") else ("https://sleeper.com" + s if s.startswith("/") else "https://sleeper.com/" + s)
        rr = get(u, tries=1)
        if rr is None:
            continue
        js = rr.text
        ks = key_pat.findall(js)
        if not ks:
            continue
        print(f"  {u} ({len(js)} bytes): {len(ks)} payout/flex/multiplier assignments")
        seen = set()
        for m in key_pat.finditer(js):
            snip = m.group(0)[:260]
            if snip in seen:
                continue
            seen.add(snip); hits += 1
            print(f"    {snip!r}")
            if len(seen) >= 40:
                break
        # chunks of JS that could be a lookup table of flex payouts
        for m in re.finditer(r"[\[{][^\[\]{}]{0,40}(1\.25|2\.25|0\.4|0\.25)[^\[\]{}]{0,200}[\]}]", js):
            print(f"    table-ish: {m.group(0)[:240]!r}")
            hits += 1
            if hits > 120:
                break
    print(f"== done, {hits} snippets")


if __name__ == "__main__":
    main()
