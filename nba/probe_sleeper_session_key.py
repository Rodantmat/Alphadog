#!/usr/bin/env python3
"""
PROBE - WHERE SLEEPER'S WEB APP KEEPS THE SIGNED-IN TOKEN (2026-10-26; the owner signs in on his own browser and hands the session
over as the GitHub secret SLEEPER_TOKEN). READ-ONLY: only Sleeper's public static JS is downloaded. Prints the code around
initializeSession / the storage calls (localStorage / sessionStorage / document.cookie / IndexedDB) that store or read the token, and
the request header the GraphQL client sends it in - so the owner copies exactly the right value and the worker sends it exactly as
the web app does.
Env: PROXY_URL (fallback route), PB_MAX (default 900 chunks).
"""
import os
import re
from collections import deque

from probe_sleeper_bundles import BARE, CHUNK, NAMEONLY, PAGES, get, norm

MAX = int(os.environ.get("PB_MAX") or 900)
KW = re.compile(r"(initializeSession|localStorage\.setItem\(|localStorage\.getItem\(|sessionStorage\.setItem\(|document\.cookie\s*=|"
                r"indexedDB\.open\(|[\"']authorization[\"']\s*:|Authorization:|setAuthToken|authToken|auth_token|\"token\"|'token')")


def main():
    base = "https://sleepercdn.com/sleeper-web/_next/"
    q, seen = deque(), set()
    for p in PAGES:
        t = get(p)
        if not t:
            continue
        for u in set(CHUNK.findall(t)) | set(BARE.findall(t)):
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
        for m in KW.finditer(t):
            hits.append((u.rsplit("/", 1)[-1][:40], m.group(0), re.sub(r"\s+", " ", t[max(0, m.start() - 350):m.start() + 450])))
    print(f"chunks fetched {n}, hits {len(hits)}", flush=True)
    done = set()
    for name, kw, c in hits:
        k = (kw, c[300:400])
        if k in done:
            continue
        done.add(k)
        if '":"' in c[300:420] and c.count('":"') > 4:
            continue
        print(f"\nHIT [{name}] {kw}\n  {c}", flush=True)
        if len(done) > 150:
            break


if __name__ == "__main__":
    main()
