#!/usr/bin/env python3
"""
PROBE - DOES THE OWNER'S SLEEPER SESSION WORK FROM THE WORKER, AND WHICH SLEEPER CALLS PRICE A PICKS ENTRY (2026-10-26; the owner
signed in on his own browser and handed the session over - nba_config.external_credentials 'sleeper_token', never printed).
READ-ONLY: (1) one harmless signed-in READ (query my_passkeys) with the token sent the two ways a web client can send it, printing only
HTTP status and the answer's STRUCTURE; (2) Sleeper's public web code: every GraphQL operation whose name is about picks / entries /
contests / payouts / multipliers / quotes, printed as its query text (so the mapping worker can ask Sleeper for a slip's payout the way
the app does). Nothing is created, submitted or changed; no mutation is sent.
Env: DATABASE_URL, PROXY_URL (route), PB_MAX (default 900 chunks).
"""
import json
import os
import re
from collections import deque

import psycopg
from curl_cffi import requests

from probe_sleeper_bundles import BARE, CHUNK, NAMEONLY, PAGES, get, norm

MAX = int(os.environ.get("PB_MAX") or 900)
PROXY = (os.environ.get("PROXY_URL") or "").strip() or None
OPS = re.compile(r"(query|mutation|subscription)\s+([A-Za-z_0-9]*(pick|entry|entries|contest|payout|multiplier|bonus|flex|lineup|quote|"
                 r"slip|wager|parlay|prop|line|vs_score|pool)[A-Za-z_0-9]*)\s*(\([^)]{0,400}\))?\s*\{[^`]{0,700}", re.I)


def shape(v, d=0):
    if isinstance(v, dict):
        return {k: (x[:80] if k in ("message", "code") and isinstance(x, str) else shape(x, d + 1)) for k, x in list(v.items())[:20]} if d < 4 else "{..}"
    if isinstance(v, list):
        return [shape(v[0], d + 1), f"len={len(v)}"] if v else []
    return v if isinstance(v, bool) or v is None else type(v).__name__


def token_test():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        r = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()
    if not r:
        print("TOKEN|none stored"); return
    tok = r[0].strip()
    body = {"operationName": "my_passkeys", "variables": {}, "query": "query my_passkeys { my_passkeys { passkey_id created } }"}
    for lab, hv in (("plain", tok), ("bearer", "Bearer " + tok)):
        for route, px in (("direct", None), ("proxy", PROXY)):
            if route == "proxy" and not PROXY:
                continue
            try:
                resp = requests.post("https://api.sleeper.app/graphql", json=body, timeout=30, impersonate="chrome124",
                                     headers={"authorization": hv, "content-type": "application/json", "origin": "https://sleeper.com",
                                              "referer": "https://sleeper.com/"},
                                     proxies={"https": px, "http": px} if px else None)
                try:
                    sh = shape(resp.json())
                except Exception:  # noqa: BLE001
                    sh = f"(non-JSON, {len(resp.text)} chars)"
                print(f"TOKEN|{lab:<6} {route:<6} HTTP {resp.status_code} => {json.dumps(sh)[:400]}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"TOKEN|{lab:<6} {route:<6} {type(exc).__name__}", flush=True)


def ops():
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
    found, n = {}, 0
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
        for m in OPS.finditer(t):
            found.setdefault((m.group(1), m.group(2)), re.sub(r"\s+", " ", m.group(0))[:900])
    print(f"\nchunks fetched {n}; picks-related operations {len(found)}", flush=True)
    for (kind, name) in sorted(found, key=lambda k: (k[0] != "query", k[1])):
        print(f"\nOP {kind} {name}\n  {found[(kind, name)]}", flush=True)


if __name__ == "__main__":
    token_test()
    ops()
