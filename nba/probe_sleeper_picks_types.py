#!/usr/bin/env python3
"""
PROBE - THE SHAPE OF SLEEPER'S PICKS READS (2026-10-26). Sleeper's API describes itself (probe_sleeper_schema run 40369491630): Picks
entries are 'parlays'; the app loads its Picks setup with query my_picks_init and lists entries with my_parlays / parlay /
num_pending_parlays; promotions with available_line_promotions; there is no quote call (an entry is placed with mutation create_parlay -
NEVER called by any worker). This prints, for those READ queries only, their arguments and the full field tree of what they return
(names and types, 4 levels deep) - type information only, no account data. READ-ONLY (introspection only), session = credential
'sleeper_token' (never printed).
Env: DATABASE_URL.
"""
import os

import psycopg
from curl_cffi import requests

READS = ("my_picks_init", "my_parlays", "parlay", "num_pending_parlays", "available_line_promotions", "my_squad_parlays",
         "get_user_pools", "my_balances")
TQ = """query T($n: String!) { __type(name: $n) { name kind fields { name args { name type { name kind of_type { name kind of_type { name kind } } } }
  type { name kind of_type { name kind of_type { name kind of_type { name kind } } } } } } }"""


def post(tok, q, v):
    r = requests.post("https://api.sleeper.app/graphql", json={"query": q, "variables": v}, timeout=60, impersonate="chrome124",
                      headers={"authorization": tok, "content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/"})
    return r.json()


def tname(t):
    """unwrap NON_NULL / LIST into a readable type label and the named type"""
    lab, base = "", t
    while base and base.get("kind") in ("NON_NULL", "LIST"):
        lab += "!" if base["kind"] == "NON_NULL" else "[]"
        base = base.get("of_type")
    return (lab + (base or {}).get("name", "?")), (base or {}).get("name"), (base or {}).get("kind")


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        tok = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()[0].strip()
    qroot = post(tok, "query { __schema { query_type { name } } }", {})["data"]["__schema"]["query_type"]["name"]
    root = post(tok, TQ, {"n": qroot})["data"]["__type"]
    cache, done = {}, set()

    def fields(name):
        if name not in cache:
            cache[name] = (post(tok, TQ, {"n": name}).get("data") or {}).get("__type") or {}
        return cache[name].get("fields") or []

    def walk(name, depth, pad):
        if depth > MAXD or name in done:
            return
        done.add(name)
        for f in fields(name):
            lab, base, kind = tname(f["type"])
            print(f"{pad}{f['name']}: {lab}", flush=True)
            if kind == "OBJECT" and base not in (name,):
                walk(base, depth + 1, pad + "    ")

    for f in root.get("fields") or []:
        if f["name"] not in READS:
            continue
        lab, base, kind = tname(f["type"])
        args = ", ".join(f"{a['name']}: {tname(a['type'])[0]}" for a in f.get("args") or [])
        print(f"\nREAD {f['name']}({args}) -> {lab}", flush=True)
        if kind == "OBJECT":
            walk(base, 1, "    ")


if __name__ == "__main__":
    main()
