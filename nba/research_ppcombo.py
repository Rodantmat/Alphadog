#!/usr/bin/env python3
"""
COMBO ANALYSIS - TWO TO SIX GOBLINS / DEMONS IN ONE SLIP. READ-ONLY. (owner 2026-11-20 18:20 PT, step 2)
Source: section CMB (mode combo): 2..6 alternates + the same regular legs up to 2..6 picks; every alternate priced alone beside a regular in the
same run (sections LEG / LESS) -> its own 2-pick reading p_i (factor f_i = p_i / 3, the "deduction" 3 - p_i).
Rules tested, out-of-sample where fitted:
  MULT  : payout = adjusted size curve applied to the SUM of ln f_i (one strength per slip)            [8ap]
  PROD  : payout = table_k x product f_i (plain)
  ADD   : payout = table_k - sum of deductions scaled to the size (owner's framing: 2.8 = -0.2 each)
Prints the 2-alternate 2-pick table (both singles, real, each rule) and exact / within-one-step / error per size and composition.
Env: DATABASE_URL, PPCMB_SINCE (2026-11-21T02:50).
"""
import json
import os
from collections import defaultdict

import numpy as np
import psycopg

TABLE = {2: 3.0, 3: 6.0, 4: 10.0, 5: 20.0, 6: 37.5}


def step(v):
    return 0.1 if v < 3 else 0.25 if v < 10 else 0.5 if v < 50 else 1.0


def snap(v):
    st = step(v)
    return round(round(v / st) * st, 4)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    since = os.environ.get("PPCMB_SINCE", "2026-11-21T02:50")
    rows = conn.execute("SELECT run_file, section, n, power, note, legs FROM nba_market.pp_quote WHERE status=200 AND section IN ('CMB','LEG','LESS') AND quoted_at >= %s", (since,)).fetchall()
    single = {}
    cmb = []
    for rf, sec, n, pw, note, legs in rows:
        pw = pw if isinstance(pw, dict) else json.loads(pw or "{}")
        legs = legs if isinstance(legs, list) else json.loads(legs or "[]")
        try:
            top = float(pw[str(n)][str(n)])
        except Exception:
            continue
        alts = [l for l in legs if l.get("odds") != "standard"]
        if sec in ("LEG", "LESS") and n == 2 and len(alts) == 1:
            a = alts[0]; single[(rf, a["id"], a["side"])] = top
        elif sec == "CMB":
            cmb.append((rf, n, top, alts, (note or "").split(" | ")[0]))
    data = []
    for rf, n, top, alts, comp in cmb:
        ps = [single.get((rf, a["id"], a["side"])) for a in alts]
        if any(p is None for p in ps):
            continue
        data.append(dict(n=n, top=top, m=len(alts), comp=comp, ps=ps, s=sum(np.log(p / 3) for p in ps)))
    print(f"CMB|combo quotes {len(cmb):,} | with every alternate's own 2-pick in the same run {len(data):,}", flush=True)
    if not data:
        return
    # 2-alternate 2-pick: the clean test
    two = [x for x in data if x["n"] == 2 and x["m"] == 2]
    if two:
        ex_m = np.mean([snap(3 * np.exp(x["s"])) == x["top"] for x in two])
        ex_a = np.mean([snap(3 - sum(3 - p for p in x["ps"])) == x["top"] for x in two])
        print(f"CMB|2 alternates in a 2-pick: {len(two)} | PROD (3 x f1 x f2) exact {100*ex_m:.0f}% | ADD (3 - d1 - d2) exact {100*ex_a:.0f}%", flush=True)
        for x in two[:25]:
            print(f"CMB|   {x['comp']:8s} singles {x['ps'][0]:.2f} & {x['ps'][1]:.2f} -> real {x['top']:.2f} | PROD {3*np.exp(x['s']):.3f} | ADD {3 - sum(3 - p for p in x['ps']):.2f}", flush=True)
    # every size: MULT (fitted curve on the sum, leave-one-composition-out), PROD
    by = defaultdict(list)
    for x in data:
        by[x["n"]].append(x)
    for n, xs in sorted(by.items()):
        S = np.array([x["s"] for x in xs]); Y = np.log([x["top"] for x in xs]); comps = np.array([x["comp"] for x in xs])
        ex = []; er = []
        for c in sorted(set(comps)):
            tr = comps != c; te = comps == c
            if tr.sum() < 8:
                continue
            co = np.polyfit(S[tr], Y[tr], 2)
            pv = np.exp(np.polyval(co, S[te]))
            for v, y in zip(pv, np.exp(Y[te])):
                ex.append(snap(v) == round(y, 4)); er.append(abs(v / y - 1))
        prod = [snap(TABLE[n] * np.exp(x["s"])) == x["top"] for x in xs]
        if ex:
            print(f"CMB|{n}-pick: {len(xs)} combos | MULT (size curve on summed strength, unseen composition) exact {100*np.mean(ex):.0f}% within-1-step {100*np.mean(np.array(er) < .05):.0f}% median error {100*np.median(er):.2f}% | PROD exact {100*np.mean(prod):.0f}%", flush=True)
        for m in sorted({x["m"] for x in xs}):
            ys = [x for x in xs if x["m"] == m]
            r = np.array([x["top"] / (TABLE[n] * np.exp(x["s"])) for x in ys])
            print(f"CMB|   {n}-pick with {m} alternates: {len(ys)} | real / (table x product of singles) median {np.median(r):.3f} (p10 {np.percentile(r,10):.3f}, p90 {np.percentile(r,90):.3f})", flush=True)


if __name__ == "__main__":
    main()
