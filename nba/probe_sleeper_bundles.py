#!/usr/bin/env python3
"""
PROBE - SLEEPER'S ENTRY PRICING CODE, FROM EVERY CHUNK OF ITS WEB APP (2026-10-25; owner 22:24 PT: "get in the app/web, build slips
and get the multipliers, as many as need to map it properly ... through actions and workers"). READ-ONLY, no login: the web app is a
Next.js build whose JS chunks are public static files. Starting from the pages (sleeper.com/picks and the app routes), every chunk
name found inside a chunk is fetched too (breadth first, up to PB_MAX), and the code around every pricing token is printed - the
Max size bonus, the Flex tiers, the contest-multiplier minimum / cap, promo boosts, and any API route that prices an entry.
Env: PROXY_URL (fallback route), PB_MAX (default 900 chunks).
"""
import os
import re
from collections import deque

from curl_cffi import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
PAGES = ["https://sleeper.com/picks", "https://sleeper.com/picks/nba", "https://sleeper.com/app", "https://sleeper.com/leagues",
         "https://sleeper.com/login"]
CHUNK = re.compile(r"(?:https://sleepercdn\.com)?/?sleeper-web/_next/static/(?:chunks/)?[A-Za-z0-9_\-/.~]+?\.js")
BARE = re.compile(r"[\"'](static/chunks/[A-Za-z0-9_\-/.~]+?\.js)[\"']")
NAMEONLY = re.compile(r"[\"']([0-9a-z][0-9a-z_\-~]{9,16}\.js)[\"']")
CODE = re.compile(r"(maxPayout|max_payout|payout_multiplier|payoutMultiplier|flex_payout|flexPayout|bonus_multiplier|bonusMultiplier|"
                  r"pick_bonus|pickBonus|size_bonus|contest_multiplier|contestMultiplier|min_multiplier|minMultiplier|max_multiplier|"
                  r"maxMultiplier|multiplier_bonus|boost_multiplier|calculatePayout|calcPayout|getPayout|computePayout|flex_tier|"
                  r"flexTier|payout_table|payoutTable|losses_allowed|lossesAllowed|num_losses|correct_required|vs_score|vsScore|"
                  r"picks_entry|create_picks_entry|picks_contest|entry_multiplier|entryMultiplier|parlay_multiplier)")
MAX = int(os.environ.get("PB_MAX") or 900)
proxy = (os.environ.get("PROXY_URL") or "").strip()


def get(url):
    for px in (None, {"https": proxy, "http": proxy} if proxy else None):
        try:
            r = requests.get(url, headers=UA, timeout=40, impersonate="chrome124", proxies=px)
            if r.status_code == 200:
                return r.text
            print(f"  {r.status_code} {url[:120]}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERR {type(exc).__name__} {url[:120]}", flush=True)
        if not proxy:
            break
    return None


def norm(u, base):
    if u.startswith("http"):
        return u
    if u.startswith("/"):
        return "https://sleepercdn.com" + u
    if u.startswith("sleeper-web/"):
        return "https://sleepercdn.com/" + u
    if u.startswith("static/"):
        return base + u
    return base + "static/chunks/" + u


def main():
    base = "https://sleepercdn.com/sleeper-web/_next/"
    q, seen = deque(), set()
    for p in PAGES:
        t = get(p)
        if not t:
            continue
        found = set(CHUNK.findall(t)) | {m for m in BARE.findall(t)}
        print(f"page {p}: {len(t)} chars, {len(found)} chunk refs", flush=True)
        for u in found:
            u = norm(u, base)
            if u not in seen:
                seen.add(u); q.append(u)
    hits, n = [], 0
    while q and n < MAX:
        u = q.popleft()
        t = get(u)
        n += 1
        if not t:
            continue
        for m in CHUNK.findall(t) + BARE.findall(t) + NAMEONLY.findall(t):
            v = norm(m, base)
            if v not in seen and "sleeper-web" in v:
                seen.add(v); q.append(v)
        for m in CODE.finditer(t):
            ctx = re.sub(r"\s+", " ", t[max(0, m.start() - 350):m.start() + 450])
            if '":"' in ctx[300:420] and ctx.count('":"') > 4:          # a localisation string table, not code
                continue
            hits.append((u.rsplit("/", 1)[-1][:40], m.group(0), ctx))
    print(f"\nchunks fetched {n}, discovered {len(seen)}, code hits {len(hits)}", flush=True)
    done = set()
    for name, kw, ctx in hits:
        k = (kw, ctx[300:380])
        if k in done:
            continue
        done.add(k)
        print(f"\n[{name}] {kw}\n  {ctx}", flush=True)
        if len(done) > 220:
            break


if __name__ == "__main__":
    main()
