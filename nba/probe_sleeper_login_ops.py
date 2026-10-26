#!/usr/bin/env python3
"""
PROBE - SLEEPER'S SIGN-IN REQUESTS, FROM ITS PUBLIC WEB CODE (2026-10-26). The login run 40282460848 showed Sleeper's answer to the
e-mail step (query login_context_by_email_or_phone_or_username): has_password false, has_phone true, has_email true - the account
signs in by a one-time code only, so the worker must ask Sleeper for that code the way the web app does. READ-ONLY: only Sleeper's
public static JS is downloaded; nothing is sent to an auth endpoint. Prints every GraphQL mutation / query text that mentions login,
otp, code, verify or passkey, plus the code around 'has_password' / 'masked_phone' (the screen that picks text vs e-mail).
Env: PROXY_URL (fallback route), PB_MAX (default 900 chunks).
"""
import os
import re
from collections import deque

from probe_sleeper_bundles import BARE, CHUNK, NAMEONLY, PAGES, get, norm

MAX = int(os.environ.get("PB_MAX") or 900)
OPS = re.compile(r"(mutation|query)\s+([a-z_0-9]*(login|otp|code|verify|passkey|sms|auth|token|session|password)[a-z_0-9]*)"
                 r"\s*(\([^)]{0,300}\))?\s*\{[^`]{0,500}", re.I)
CTX = re.compile(r"(has_password|masked_phone|masked_email|login_context_by|has_passkeys)")


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
    ops, ctx, n = {}, [], 0
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
            ops.setdefault(m.group(2), re.sub(r"\s+", " ", m.group(0))[:700])
        for m in CTX.finditer(t):
            if len(ctx) < 40:
                ctx.append((u.rsplit("/", 1)[-1][:40], m.group(0), re.sub(r"\s+", " ", t[max(0, m.start() - 600):m.start() + 900])))
    print(f"chunks fetched {n}, discovered {len(seen)}, sign-in operations {len(ops)}", flush=True)
    for k in sorted(ops):
        print(f"\nOP {k}\n  {ops[k]}", flush=True)
    done = set()
    for name, kw, c in ctx:
        if c[550:650] in done:
            continue
        done.add(c[550:650])
        print(f"\nCTX [{name}] {kw}\n  {c}", flush=True)


if __name__ == "__main__":
    main()
