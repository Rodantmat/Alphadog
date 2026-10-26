#!/usr/bin/env python3
"""
PROBE - THE NAMES OF SLEEPER'S PICKS CALLS (2026-10-26). Sleeper Picks lives in the mobile app only (sleeper.com/picks is a landing
page; signed in as the owner it fires no picks call - probe run 40367099511), so the names of the calls that price an entry are not in
any public web code. This asks Sleeper's own GraphQL API, with the owner's session (credential 'sleeper_token', never printed), to
describe itself (standard GraphQL introspection - a read; if Sleeper has it switched off, the answer says so). Prints only the NAMES
of the query / mutation fields (and the argument names of the picks-related ones). READ-ONLY: nothing else is sent.
Env: DATABASE_URL, PROXY_URL.
"""
import json
import os
import re

import psycopg
from curl_cffi import requests

PROXY = (os.environ.get("PROXY_URL") or "").strip() or None
Q = """query IntrospectionLite { __schema { query_type { name } mutation_type { name }
  types { name kind fields { name args { name } } } } }"""
PICKY = re.compile(r"(pick|entry|entries|contest|payout|multiplier|bonus|flex|lineup|quote|slip|wager|parlay|prop|line|vs|pool|promo)", re.I)


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        tok = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()[0].strip()
    r = requests.post("https://api.sleeper.app/graphql", json={"query": Q, "operationName": "IntrospectionLite", "variables": {}},
                      timeout=60, impersonate="chrome124",
                      headers={"authorization": tok, "content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/"})
    print(f"SCHEMA|HTTP {r.status_code}, {len(r.text)} chars", flush=True)
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        print("SCHEMA|not JSON"); return
    if j.get("errors"):
        print("SCHEMA|errors:", [str(e.get("message"))[:160] for e in j["errors"]][:5])
    s = (j.get("data") or {}).get("__schema")
    if not s:
        return
    roots = {s["query_type"]["name"]: "QUERY", (s.get("mutation_type") or {}).get("name"): "MUTATION"}
    for t in s["types"]:
        if t["name"] in roots and t.get("fields"):
            names = [f["name"] for f in t["fields"]]
            print(f"\nSCHEMA|{roots[t['name']]} fields: {len(names)}")
            print("  all:", ", ".join(sorted(names)))
            for f in t["fields"]:
                if PICKY.search(f["name"]):
                    print(f"  PICKS? {roots[t['name']].lower()} {f['name']}({', '.join(a['name'] for a in f.get('args') or [])})")


if __name__ == "__main__":
    main()
