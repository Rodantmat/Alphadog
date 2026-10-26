#!/usr/bin/env python3
"""
PROBE - SLEEPER'S OWN PAYOUT NUMBERS FROM THE OWNER'S ENTRIES + PICKS SETUP (2026-10-26). Sleeper's API (probe_sleeper_picks_types run
40372556481): an entry ('Parlay') carries multiplier, max_multiplier, possible_multipliers {lost0, lost1, lost2, team_pick_lost} (the
Flex tiers by misses) and its legs (each with its Line); my_picks_init returns the Picks setup as a JSON map. This READS (no mutation,
nothing placed or changed):
  1 my_picks_init - its key tree, and every value under a key about multipliers / bonuses / payouts / flex / picks counts;
  2 the Line type's scalar fields, then my_parlays (up to 200 entries, newest first) printing per entry ONLY: legs, status, multiplier,
    max_multiplier, possible_multipliers, graded_multiplier, created date, and per leg its status + the line's multiplier-like fields.
    Amounts, balances, user ids and names are never printed.
PRIVATE OUTPUT: the repo and its logs are public and the owner's entries are personal, so every detail line goes ONLY to the private
credential store (nba_config.external_credentials 'sleeper_probe_out', replaced each run); the public log shows counts only.
Session = credential 'sleeper_token' (never printed). Env: DATABASE_URL.
"""
import datetime as dt
import json
import os
import re

import psycopg
from curl_cffi import requests

KEEP = re.compile(r"(multip|bonus|payout|flex|max|min|tier|pick|leg|boost|table|size|count|power|vs|pool|type)", re.I)
DROP = re.compile(r"(balance|amount|email|phone|name|address|user|avatar|location|dob|ssn|card|bank)", re.I)
TQ = """query T($n: String!) { __type(name: $n) { fields { name type { name kind of_type { name kind of_type { name kind } } } } } }"""


def post(tok, q, v=None):
    r = requests.post("https://api.sleeper.app/graphql", json={"query": q, "variables": v or {}}, timeout=60, impersonate="chrome124",
                      headers={"authorization": tok, "content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/"})
    return r.status_code, r.json()


def tree(v, path="", out=None, d=0):
    out = [] if out is None else out
    if isinstance(v, dict):
        for k, x in v.items():
            p = f"{path}.{k}" if path else k
            if DROP.search(k):
                out.append((p, "<skipped>")); continue
            if isinstance(x, (dict, list)) and d < 6:
                tree(x, p, out, d + 1)
            elif KEEP.search(p):
                out.append((p, x))
            else:
                out.append((p, type(x).__name__))
    elif isinstance(v, list):
        if all(not isinstance(x, (dict, list)) for x in v):
            out.append((path, v[:60]))                 # a plain list (e.g. a bonus table) is kept whole
        else:
            out.append((path, f"list len={len(v)}"))
            for i, x in enumerate(v[:12]):              # tables of objects: the first 12 rows
                tree(x, f"{path}[{i}]", out, d + 1)
    return out


def scalars(tok, tname):
    st, j = post(tok, TQ, {"n": tname})
    fs = ((j.get("data") or {}).get("__type") or {}).get("fields") or []
    out = []
    for f in fs:
        t = f["type"]
        while t and t.get("kind") in ("NON_NULL", "LIST"):
            t = t.get("of_type")
        if t and t.get("kind") in ("SCALAR", "ENUM"):
            out.append(f["name"])
    return out


OUT = []


def say(line):
    OUT.append(line)


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        tok = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()[0].strip()
    try:
        run(tok)
    finally:
        with psycopg.connect(os.environ["DATABASE_URL"]) as c:
            c.execute("DELETE FROM nba_config.external_credentials WHERE credential_key = 'sleeper_probe_out'")
            c.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES "
                      "('sleeper_probe_out', %s, now())", ("\n".join(OUT),))
            c.commit()
        print(f"PROBE_OUT|{len(OUT)} lines stored privately in external_credentials 'sleeper_probe_out'", flush=True)


def run(tok):
    st, j = post(tok, "query { my_picks_init }")
    say(f"INIT|HTTP {st} errors={[e.get('message') for e in j.get('errors') or []][:3]}")
    print(f"INIT|HTTP {st}", flush=True)
    for p, v in tree((j.get("data") or {}).get("my_picks_init")):
        say(f"INIT|{p} = {json.dumps(v)[:300]}")

    line_f = [f for f in scalars(tok, "Line") if not DROP.search(f)]
    say(f"LINE fields: {line_f}")
    lsel = " ".join(line_f)
    q = ("query { my_parlays(limit: 200, offset: 0, include_pick_counts: false) { parlay_id status created multiplier max_multiplier "
         "graded_multiplier possible_multipliers { lost0 lost1 lost2 team_pick_lost } legs { status line { " + lsel + " } } } }")
    st, j = post(tok, q)
    say(f"PARLAYS|HTTP {st} errors={[e.get('message') for e in j.get('errors') or []][:3]}")
    print(f"PARLAYS|HTTP {st}", flush=True)
    ps = (j.get("data") or {}).get("my_parlays") or []
    say(f"PARLAYS|{len(ps)} entries")
    print(f"PARLAYS|{len(ps)} entries", flush=True)
    for i, p in enumerate(ps):
        legs = p.get("legs") or []
        day = dt.datetime.fromtimestamp((p.get("created") or 0) / 1000, dt.timezone.utc).strftime("%Y-%m-%d") if p.get("created") else "?"
        say(f"P{i} {day} {len(legs)} legs | {p.get('status')} | mult {p.get('multiplier')} | max {p.get('max_multiplier')} | "
              f"tiers {json.dumps(p.get('possible_multipliers'))} | graded {p.get('graded_multiplier')}")
        for lg in legs:
            ln = lg.get("line") or {}
            keep = {k: v for k, v in ln.items() if KEEP.search(k) or k in ("sport", "line_type", "outcome", "subject_type", "wager_type", "game_id")}
            say(f"   leg {lg.get('status')} {json.dumps(keep)[:400]}")


if __name__ == "__main__":
    main()
