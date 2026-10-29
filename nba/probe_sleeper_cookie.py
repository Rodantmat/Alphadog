#!/usr/bin/env python3
"""
PROBE - DOES THE OWNER'S SLEEPER COOKIE WORK FROM THE WORKER? (2026-10-29; owner 12:26 PT: GitHub secret SLEEPER_COOKIE saved; "lets try
for sleeper and if it works we try for fliff"). READ-ONLY, one harmless signed-in READ (query my_passkeys), nothing created / submitted /
changed, no mutation. Prints only: cookie NAMES and value LENGTHS (never values), HTTP status and the answer's STRUCTURE. The stored
sleeper_token is tried the same way as the baseline. Env: SLEEPER_COOKIE (workflow secret), DATABASE_URL, PROXY_URL.
"""
import json
import os

import psycopg
from curl_cffi import requests

PROXY = (os.environ.get("PROXY_URL") or "").strip() or None
URL = "https://api.sleeper.app/graphql"
BODY = {"operationName": "my_passkeys", "variables": {}, "query": "query my_passkeys { my_passkeys { passkey_id created } }"}


def shape(v, d=0):
    if isinstance(v, dict):
        return {k: (x[:80] if k in ("message", "code") and isinstance(x, str) else shape(x, d + 1)) for k, x in list(v.items())[:20]} if d < 4 else "{..}"
    if isinstance(v, list):
        return [shape(v[0], d + 1), f"len={len(v)}"] if v else []
    return v if isinstance(v, bool) or v is None else type(v).__name__


def call(label, headers, px):
    h = {"content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/"}
    h.update(headers)
    try:
        r = requests.post(URL, json=BODY, timeout=30, impersonate="chrome124", headers=h, proxies={"https": px, "http": px} if px else None)
        try:
            sh = shape(r.json())
        except Exception:  # noqa: BLE001
            sh = f"(non-JSON, {len(r.text)} chars)"
        print(f"COOKIE|{label} HTTP {r.status_code} => {json.dumps(sh)[:400]}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"COOKIE|{label} {type(exc).__name__}", flush=True)


def main():
    ck = (os.environ.get("SLEEPER_COOKIE") or "").strip()
    if not ck:
        print("COOKIE|SLEEPER_COOKIE is empty in this run (secret not passed to the workflow)")
        return
    parts = [p.strip() for p in ck.split(";") if p.strip()]
    names = [(p.split("=", 1)[0], len(p.split("=", 1)[1]) if "=" in p else 0) for p in parts]
    print(f"COOKIE|stored value: {len(ck)} chars, {len(parts)} cookie(s): " + ", ".join(f"{n}({l})" for n, l in names), flush=True)
    routes = [("direct", None)] + ([("proxy", PROXY)] if PROXY else [])
    for route, px in routes:
        call(f"cookie header only        {route:<6}", {"cookie": ck}, px)
    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as c:
            r = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key='sleeper_token'").fetchone()
        tok = r[0].strip() if r else None
    except Exception as exc:  # noqa: BLE001
        tok = None
        print(f"COOKIE|token read {type(exc).__name__}")
    for route, px in routes:
        if tok:
            call(f"stored token (baseline) {route:<6}", {"authorization": tok}, px)
        call(f"no credentials (control)  {route:<6}", {}, px)
    print("COOKIE|done", flush=True)


if __name__ == "__main__":
    main()
