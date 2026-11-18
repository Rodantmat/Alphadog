#!/usr/bin/env python3
"""
SLEEPER FLEX TIERS - WHERE THE SLIP SCREEN'S MULTIPLIERS MISS (owner 2026-11-18 14:19 PT: on 5 / 6-pick Flex the shown full-hit multiplier is a little under
Sleeper's and the partial-hit ones a little over - a pattern, not board drift). READ-ONLY: one signed-in read of the owner's entries (query my_parlays, credential
'sleeper_token', never printed), the same read as probe_sleeper_payout_fit.py. Each entry carries its legs' multipliers and Sleeper's own tiers (lost0 / lost1 / lost2).
Prints rule-level aggregates only (the per-entry rows go to the private credential store 'sleeper_fit_rows'): the deployed model's signed error per tier and size,
how the tier split moves with the leg mix, and candidate formulas scored to the cent.  Env: DATABASE_URL, ST_MODE (fetch | stored).
"""
import itertools
import json
import math
import os
import statistics as stx
import urllib.request
from collections import defaultdict

import numpy as np
import psycopg

Q = ("query { my_parlays(limit: 500, offset: 0, include_pick_counts: false) { status max_multiplier "
     "possible_multipliers { lost0 lost1 lost2 } legs { status line { payout_multiplier game_id outcome subject_team subject_id "
     "sport line_type wager_type } } } }")
FLEX_EV = {3: 1.0012, 4: 1.0801, 5: 1.148, 6: 1.197}
FLEX_R = {3: (0.3287, 0.0), 4: (0.2474, 0.0), 5: (0.235, 0.049), 6: (0.096, 0.0193)}


def f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def fetch():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        tok = c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_token'").fetchone()[0].strip()
    req = urllib.request.Request("https://api.sleeper.app/graphql", data=json.dumps({"query": Q, "variables": {}}).encode(),
                                 headers={"authorization": tok, "content-type": "application/json", "origin": "https://sleeper.com", "referer": "https://sleeper.com/",
                                          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"})
    j = json.loads(urllib.request.urlopen(req, timeout=90).read())
    if j.get("errors"):
        print("errors:", [e.get("message") for e in j["errors"]][:3])
    ps = (j.get("data") or {}).get("my_parlays") or []
    print(f"entries read: {len(ps)}", flush=True)
    rows = []
    for idx, p in enumerate(ps):
        legs = [l for l in (p.get("legs") or []) if l.get("status") != "canceled" and (l.get("line") or {}).get("line_type") != "filler"]
        if len(legs) < 2 or p.get("status") == "canceled":
            continue
        m = [f(l["line"]["payout_multiplier"]) for l in legs]
        if any(x is None for x in m):
            continue
        tiers = p.get("possible_multipliers") or {}
        g = [l["line"].get("game_id") for l in legs]
        team = [l["line"].get("subject_team") for l in legs]
        side = [l["line"].get("outcome") for l in legs]
        n = len(m)
        sg = sorted(("T" if team[i] == team[k] else "O") + ("S" if side[i] == side[k] else "X") for i, k in itertools.combinations(range(n), 2) if g[i] == g[k])
        rows.append({"i": idx, "n": n, "m": m, "T0": f(tiers.get("lost0")), "T1": f(tiers.get("lost1")), "T2": f(tiers.get("lost2")), "max": f(p.get("max_multiplier")),
                     "sg": sg, "promo": any((l["line"].get("line_type") or "") != "normal" for l in legs), "all_live": len(legs) == len(p.get("legs") or []),
                     "sport": "+".join(sorted({l["line"].get("sport") or "?" for l in legs}))})
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        c.execute("DELETE FROM nba_config.external_credentials WHERE credential_key = 'sleeper_fit_rows'")
        c.execute("INSERT INTO nba_config.external_credentials (credential_key, credential_value_encrypted, updated_at) VALUES ('sleeper_fit_rows', %s, now())", (json.dumps(rows),))
        c.commit()
    return rows


def probs(m):
    n = len(m)
    q = [1 / x for x in m]
    pall = math.prod(q)
    p1 = sum(pall / q[i] * (1 - q[i]) for i in range(n))
    p2 = sum(pall / (q[i] * q[k]) * (1 - q[i]) * (1 - q[k]) for i, k in itertools.combinations(range(n), 2))
    return pall, p1, p2


def esym(m, k):
    return sum(math.prod(c) for c in itertools.combinations(m, k))


def qs(v):
    v = sorted(v)
    return f"min {v[0]:.4f} p10 {v[len(v) // 10]:.4f} med {stx.median(v):.4f} p90 {v[-1 - len(v) // 10]:.4f} max {v[-1]:.4f}"


def main():
    if os.getenv("ST_MODE", "fetch") == "stored":
        with psycopg.connect(os.environ["DATABASE_URL"]) as c:
            rows = json.loads(c.execute("SELECT credential_value_encrypted FROM nba_config.external_credentials WHERE credential_key = 'sleeper_fit_rows'").fetchone()[0])
    else:
        rows = fetch()
    fl = [r for r in rows if r["T1"] is not None and r["T0"]]
    print(f"usable entries {len(rows)}; flex {len(fl)}; by size " + ", ".join(f"{n}p {sum(1 for r in fl if r['n'] == n)}" for n in (3, 4, 5, 6)))
    for n in (3, 4, 5, 6):
        for tag, sel in (("clean (no same-game, normal lines, nothing voided)", lambda r: not r["sg"] and not r["promo"] and r.get("all_live", True)),
                         ("same-game pairs", lambda r: bool(r["sg"]) and not r["promo"]), ("promo legs", lambda r: r["promo"])):
            v = [r for r in fl if r["n"] == n and sel(r)]
            if len(v) < 3:
                continue
            print(f"\n=== {n}-pick Flex, {tag}: {len(v)} entries (first = newest; newest 40 marked 'recent')")
            for lab, vv in (("all", v), ("recent", v[:40])):
                e0, e1, e2, ev = [], [], [], []
                for r in vv:
                    pall, p1, p2 = probs(r["m"])
                    r1, r2 = FLEX_R[n]
                    t0 = FLEX_EV[n] / (pall + r1 * p1 + r2 * p2)
                    e0.append(t0 / r["T0"] - 1)
                    e1.append(t0 * r1 / r["T1"] - 1)
                    if r["T2"]:
                        e2.append(t0 * r2 / r["T2"] - 1)
                    ev.append(r["T0"] * pall + r["T1"] * p1 + (r["T2"] or 0) * p2)
                print(f"  DEPLOYED MODEL vs Sleeper ({lab} {len(vv)}): full hit {100 * stx.mean(e0):+.2f}% (med {100 * stx.median(e0):+.2f}%, within 1% {sum(abs(x) <= .01 for x in e0)}/{len(e0)}) | "
                      f"1 miss {100 * stx.mean(e1):+.2f}% (med {100 * stx.median(e1):+.2f}%)" + (f" | 2 miss {100 * stx.mean(e2):+.2f}% (med {100 * stx.median(e2):+.2f}%)" if e2 else "")
                      + f" | Sleeper EV at q=1/m: {qs(ev)}")
            t10 = [r["T1"] / r["T0"] for r in v]
            print(f"  T1/T0: {qs(t10)}" + (f" | T2/T0: {qs([r['T2'] / r['T0'] for r in v if r['T2']])}" if n >= 5 else ""))
            P = [math.prod(r["m"]) for r in v]
            print(f"  T0/product: {qs([r['T0'] / p for r, p in zip(v, P)])}")
            print(f"  T1/mean((n-1)-leg products): {qs([r['T1'] / (esym(r['m'], n - 1) / n) for r in v])}")
            if n >= 5:
                w = [r for r in v if r["T2"]]
                print(f"  T2/mean((n-2)-leg products): {qs([r['T2'] / (esym(r['m'], n - 2) / math.comb(n, 2)) for r in w])}")
            # how the split moves with the leg mix
            feats = {"product": P, "mean m": [stx.mean(r["m"]) for r in v], "min m": [min(r["m"]) for r in v], "max m": [max(r["m"]) for r in v],
                     "sd m": [stx.pstdev(r["m"]) for r in v], "p1/pall": [probs(r["m"])[1] / probs(r["m"])[0] for r in v]}
            for name, y in (("T1/T0", t10), ("T0/product", [r["T0"] / p for r, p in zip(v, P)])):
                print(f"  corr({name}, .): " + ", ".join(f"{k} {np.corrcoef(y, x)[0, 1]:+.2f}" for k, x in feats.items()))
            # CANDIDATES, each scored by entries reproduced within 1% on every tier
            def score(fn):
                ok = [0, 0, 0]; tot2 = 0; errs = [[], [], []]
                for r in v:
                    t = fn(r["m"])
                    for j, key in enumerate(("T0", "T1", "T2")):
                        if r[key] and t[j]:
                            errs[j].append(t[j] / r[key] - 1)
                return " | ".join(f"{k} mean {100 * stx.mean(e):+.2f}% within1% {sum(abs(x) <= .01 for x in e)}/{len(e)}" for k, e in zip(("full", "1miss", "2miss"), errs) if e)
            # A: power law on the leg product: tier_k = a_k x (mean of the surviving-leg products)^b_k
            def fitpow(x, y):
                b, a = np.polyfit(np.log(x), np.log(y), 1)
                return math.exp(a), b
            a0, b0 = fitpow(P, [r["T0"] for r in v])
            x1 = [esym(r["m"], n - 1) / n for r in v]
            a1, b1 = fitpow(x1, [r["T1"] for r in v])
            if n >= 5:
                w = [r for r in v if r["T2"]]
                a2, b2 = fitpow([esym(r["m"], n - 2) / math.comb(n, 2) for r in w], [r["T2"] for r in w])
            else:
                a2, b2 = 0.0, 1.0
            print(f"  A power law: full = {a0:.4f} x P^{b0:.4f}; 1 miss = {a1:.4f} x S1^{b1:.4f}" + (f"; 2 miss = {a2:.4f} x S2^{b2:.4f}" if n >= 5 else ""))
            print("     " + score(lambda m: (a0 * math.prod(m) ** b0, a1 * (esym(m, n - 1) / n) ** b1, a2 * (esym(m, n - 2) / math.comb(n, 2)) ** b2 if n >= 5 else None)))
            # B: EV target with the split r1 a linear function of p1/pall (how likely one miss is against a sweep)
            ev_n = stx.median([r["T0"] * probs(r["m"])[0] + r["T1"] * probs(r["m"])[1] + (r["T2"] or 0) * probs(r["m"])[2] for r in v])
            x = np.array(feats["p1/pall"])
            c1 = np.polyfit(x, np.array(t10), 1)
            if n >= 5:
                w = [r for r in v if r["T2"]]
                c2 = np.polyfit(np.array([probs(r["m"])[1] / probs(r["m"])[0] for r in w]), np.array([r["T2"] / r["T0"] for r in w]), 1)
            else:
                c2 = np.array([0.0, 0.0])
            def modB(m):
                pall, p1, p2 = probs(m)
                r1 = c1[0] * p1 / pall + c1[1]; r2 = c2[0] * p1 / pall + c2[1]
                t0 = ev_n / (pall + r1 * p1 + r2 * p2)
                return t0, t0 * r1, (t0 * r2 if n >= 5 else None)
            print(f"  B EV {ev_n:.4f} with r1 = {c1[0]:+.5f} x (p1/pall) {c1[1]:+.4f}" + (f", r2 = {c2[0]:+.6f} x (p1/pall) {c2[1]:+.4f}" if n >= 5 else ""))
            print("     " + score(modB))
            # C: the deployed shape refitted on these entries (EV median, median ratios)
            r1m = stx.median(t10); r2m = stx.median([r["T2"] / r["T0"] for r in v if r["T2"]]) if n >= 5 else 0.0
            def modC(m):
                pall, p1, p2 = probs(m)
                t0 = ev_n / (pall + r1m * p1 + r2m * p2)
                return t0, t0 * r1m, (t0 * r2m if n >= 5 else None)
            print(f"  C deployed shape refitted: EV {ev_n:.4f}, r1 {r1m:.4f}, r2 {r2m:.4f}")
            print("     " + score(modC))


if __name__ == "__main__":
    main()
