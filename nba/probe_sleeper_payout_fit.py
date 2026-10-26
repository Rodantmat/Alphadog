#!/usr/bin/env python3
"""
PROBE - SLEEPER'S PAYOUT RULES, FITTED ON SLEEPER'S OWN ENTRY DATA (2026-10-26; owner 11:11 PT "keep going"). READ-ONLY: one
signed-in READ of the owner's entries (query my_parlays, session = credential 'sleeper_token', never printed); nothing placed or
changed. Each entry carries its legs' multipliers (Line.payout_multiplier), Sleeper's own max_multiplier and Flex tiers
(possible_multipliers lost0 / lost1 / lost2). Fits:
  MAX  ratio R = max_multiplier / product(live legs), by size and by same-game structure (pairs in one game: same team or not,
       same side or not) - the size bonus and any correlation price-down;
  FLEX EV at Sleeper's own implied chances (q = 1/m) by size, and the tier split (T1/T0, T2/T0) against leg-mix measures, plus a
       few candidate formulas, scored by how many entries they reproduce to the cent.
PRIVATE: the owner's entries are personal and this repo's logs are public, so the per-entry table goes ONLY to the private
credential store (nba_config.external_credentials 'sleeper_fit_rows'); the log prints rule-level aggregates only.
Env: DATABASE_URL.
"""
import itertools
import json
import math
import os
import statistics as stx
from collections import defaultdict

import psycopg
from curl_cffi import requests

Q = ("query { my_parlays(limit: 500, offset: 0, include_pick_counts: false) { status max_multiplier "
     "possible_multipliers { lost0 lost1 lost2 } legs { status line { payout_multiplier game_id outcome subject_team subject_id "
     "sport line_type wager_type } } } }")


def f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        tok = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()[0].strip()
    r = requests.post("https://api.sleeper.app/graphql", json={"query": Q, "variables": {}}, timeout=90, impersonate="chrome124",
                      headers={"authorization": tok, "content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/"})
    j = r.json()
    if j.get("errors"):
        print("errors:", [e.get("message") for e in j["errors"]][:3])
    ps = (j.get("data") or {}).get("my_parlays") or []
    print(f"entries read: {len(ps)}", flush=True)
    rows, maxr, flex = [], defaultdict(list), defaultdict(list)
    for p in ps:
        legs = [l for l in (p.get("legs") or []) if l.get("status") != "canceled" and (l.get("line") or {}).get("line_type") != "filler"]
        if len(legs) < 2 or p.get("status") == "canceled":
            continue
        m = [f(l["line"]["payout_multiplier"]) for l in legs]
        if any(x is None for x in m):
            continue
        P = math.prod(m)
        n = len(m)
        tiers = p.get("possible_multipliers") or {}
        T0, T1, T2 = f(tiers.get("lost0")), f(tiers.get("lost1")), f(tiers.get("lost2"))
        g = [l["line"].get("game_id") for l in legs]
        team = [l["line"].get("subject_team") for l in legs]
        side = [l["line"].get("outcome") for l in legs]
        sg = [(i, k) for i, k in itertools.combinations(range(n), 2) if g[i] == g[k]]
        sg_kind = sorted(("T" if team[i] == team[k] else "O") + ("S" if side[i] == side[k] else "X") for i, k in sg)
        promo = any((l["line"].get("line_type") or "") != "normal" for l in legs)
        sport = "+".join(sorted({l["line"].get("sport") or "?" for l in legs}))
        is_flex = T1 is not None
        q = [1 / x for x in m]
        pall = math.prod(q)
        p1 = sum(pall / q[i] * (1 - q[i]) for i in range(n))
        p2 = sum(pall / (q[i] * q[k]) * (1 - q[i]) * (1 - q[k]) for i, k in itertools.combinations(range(n), 2))
        row = {"n": n, "P": round(P, 4), "m": m, "T0": T0, "T1": T1, "T2": T2, "max": f(p.get("max_multiplier")), "flex": is_flex,
               "sg": sg_kind, "promo": promo, "sport": sport,
               "ev": round((T0 or 0) * pall + (T1 or 0) * p1 + (T2 or 0) * p2, 4) if is_flex else None,
               "sum_m1": round(sum(x - 1 for x in m), 4), "maxm": max(m)}
        rows.append(row)
        key = (n, "flex" if is_flex else "max", "promo" if promo else "normal", "+".join(sg_kind) or "none")
        if is_flex:
            flex[key].append(row)
        elif T0:
            maxr[key].append(T0 / P)

    print("\nMAX: R = Sleeper max / product of live legs  (n | leg types | same-game pairs: T/O same/other team, S/X same/opposite side)")
    for key in sorted(maxr):
        v = maxr[key]
        print(f"  {key[0]}p {key[2]:<6} sg={key[3]:<14} entries {len(v):3d} | R median {stx.median(v):.4f} min {min(v):.4f} max {max(v):.4f}")
    print("\nFLEX: EV at Sleeper's implied chances (sum of tier x chance with q = 1/m), and the tier split")
    for key in sorted(flex):
        v = flex[key]
        ev = [x["ev"] for x in v]
        t10 = [x["T1"] / x["T0"] for x in v if x["T0"]]
        t20 = [x["T2"] / x["T0"] for x in v if x["T0"] and x["T2"]]
        print(f"  {key[0]}p {key[2]:<6} sg={key[3]:<14} entries {len(v):3d} | EV median {stx.median(ev):.4f} [{min(ev):.4f}, {max(ev):.4f}] | "
              f"T1/T0 {stx.median(t10):.3f} [{min(t10):.3f}, {max(t10):.3f}]" + (f" | T2/T0 {stx.median(t20):.4f}" if t20 else ""))

    # candidate split formulas on clean flex entries (no same-game, normal lines): which reproduces T0 / T1 / T2 to the cent?
    clean = [x for k, v in flex.items() if k[3] == "none" and k[2] == "normal" for x in v]
    print(f"\nFLEX SPLIT CANDIDATES on {len(clean)} clean entries (all legs different games, normal lines)")
    by_n = defaultdict(list)
    for x in clean:
        by_n[x["n"]].append(x)
    for n, v in sorted(by_n.items()):
        e_n = stx.median([x["ev"] for x in v])
        # C1: fixed ratios r1, r2 per size, T0 solved from the EV target
        r1 = stx.median([x["T1"] / x["T0"] for x in v])
        r2 = stx.median([x["T2"] / x["T0"] for x in v if x["T2"]]) if n >= 5 else 0.0
        hit = [0, 0, 0]
        for x in v:
            m = x["m"]; q = [1 / y for y in m]; pall = math.prod(q)
            p1 = sum(pall / q[i] * (1 - q[i]) for i in range(n))
            p2 = sum(pall / (q[i] * q[k]) * (1 - q[i]) * (1 - q[k]) for i, k in itertools.combinations(range(n), 2))
            t0 = e_n / (pall + r1 * p1 + r2 * p2)
            hit[0] += abs(t0 - x["T0"]) <= 0.015
            hit[1] += abs(t0 * r1 - x["T1"]) <= 0.015
            hit[2] += (n < 5) or abs(t0 * r2 - (x["T2"] or 0)) <= 0.015
        # correlation of the split with leg-mix measures
        def corr(a, b):
            if len(a) < 3:
                return float("nan")
            ma, mb = stx.mean(a), stx.mean(b)
            sa = math.sqrt(sum((y - ma) ** 2 for y in a)); sb = math.sqrt(sum((y - mb) ** 2 for y in b))
            return sum((y - ma) * (z - mb) for y, z in zip(a, b)) / (sa * sb) if sa and sb else float("nan")
        t10 = [x["T1"] / x["T0"] for x in v]
        print(f"  {n}p: entries {len(v)} | EV target {e_n:.4f} | C1 fixed ratios r1 {r1:.4f} r2 {r2:.4f}: T0 within 1c {hit[0]}/{len(v)}, "
              f"T1 {hit[1]}/{len(v)}, T2 {hit[2]}/{len(v)} | corr(T1/T0, product) {corr(t10, [x['P'] for x in v]):+.2f}, "
              f"corr(T1/T0, max leg) {corr(t10, [x['maxm'] for x in v]):+.2f}, corr(T1/T0, sum(m-1)) {corr(t10, [x['sum_m1'] for x in v]):+.2f}")

    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("DELETE FROM nba_config.external_credentials WHERE credential_key = 'sleeper_fit_rows'")
        c.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES "
                  "('sleeper_fit_rows', %s, now())", (json.dumps(rows),))
        c.commit()
    print(f"\nper-entry table ({len(rows)} rows) stored privately in external_credentials 'sleeper_fit_rows'")


if __name__ == "__main__":
    main()
