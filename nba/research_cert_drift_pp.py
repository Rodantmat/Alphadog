#!/usr/bin/env python3
"""DRIFT / DROP / SUB / SHRINK study for the owner's PrizePicks units (portfolio B + J + U4 + F5), on the same replay as research_cert_owner_pp.py.
Every leg of a slip is pulled / drifted off the board with probability q (the live quote gate skipped 10-33% of this season's placed PrizePicks slips - about 3-8% a leg).
Policies on a drifted leg: SKIP (the whole slip is not played), DROP (play the slip one pick smaller: payout of the smaller entry, void under 2 picks), SUB (the unit's next ranked
candidate comes in - distinct player, the unit's game cap - and drops only when none is left). PAYCUT: no leg lost but the line moved (a leg's payout worse): the slip pays x0.95 / x0.90 only when it wins.
30 seeds per q. READ-ONLY, flat 1u. FR_APP is PP."""
import collections
import os
import random
import sys

import psycopg

os.environ["FR_APP"] = "PP"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import friend_engine as FE            # noqa: E402
import live_slip_engine as L          # noqa: E402
import portfolio_b as PB              # noqa: E402

conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
ORDER = ["B3", "B4", "B5", "B7", "B9", "U4", "J1", "J2", "J3", "F5"]
STORE = []          # (season, day, uid, structure, slip, candidate list, game cap)


def season_of(d):
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


for season, d, prep in FE.pp_days(conn):
    try:
        PB.attach_aedge(prep, L.pb_last10(conn, d, {l["player_id"] for l in prep}))
    except Exception:
        pass
    for uid in ORDER:
        try:
            s = PB.unit_slip(prep, uid)
            if not s:
                continue
            c, gc, pc = PB.candidates(prep, uid)
            if uid in PB.BANS:
                banned = set()
                for b in PB.BANS[uid]:
                    sb = PB.unit_slip(prep, b)
                    if sb:
                        banned |= {l["player"] for l in sb}
                c = [l for l in c if l["player"] not in banned]
        except Exception:
            continue
        STORE.append((season, d, uid, PB.UNITS[uid][3], s, c, gc))
print(f"unit-slips stored: {len(STORE)}", flush=True)


def pay(legs, st):
    if len(legs) < 2:
        return 1.0
    live = [l for l in legs if l.get("hit") is not None]
    if len(live) < 2:
        return 1.0
    stt = st if len(legs) > 2 else "power"
    return float(FE.PC.grade(legs, stt))


def run(q, policy, rng, cut=1.0):
    out = collections.defaultdict(lambda: [0, 0.0])      # (uid, season) -> [slips placed, net]
    for season, d, uid, st, s, cand, gc in STORE:
        drift = [rng.random() < q for _ in s]
        legs = list(s)
        if any(drift):
            if policy == "skip":
                continue
            if policy == "drop":
                legs = [l for l, x in zip(s, drift) if not x]
                if len(legs) < 2:
                    continue
            elif policy == "sub":
                keep = [l for l, x in zip(s, drift) if not x]
                used = {l["player"] for l in s}; games = collections.Counter(l["event_id"] for l in keep)
                pool = [l for l in cand if l["player"] not in used]
                new = []
                for _ in range(sum(drift)):
                    pick = None
                    for l in pool:
                        if l["player"] in used or games[l["event_id"]] >= gc:
                            continue
                        pick = l; break
                    if pick is None:
                        break
                    new.append(pick); used.add(pick["player"]); games[pick["event_id"]] += 1
                legs = keep + new
                if len(legs) < 2:
                    continue
        m = pay(legs, st)
        if cut != 1.0 and m > 1.0:
            m *= cut
        o = out[(uid, season)]
        o[0] += 1; o[1] += m - 1.0
    return out


def summarize(label, fn):
    agg = collections.defaultdict(lambda: [0.0, 0.0])
    for sd in range(30):
        res = fn(random.Random(1000 + sd))
        for (uid, season), (n, net) in res.items():
            for key in ((uid, "ALL"), (uid, season), ("SET", "ALL"), ("SET", season)):
                agg[key][0] += n; agg[key][1] += net
    return {k: (v[0] / 30, v[1] / 30) for k, v in agg.items()}


base = summarize("base", lambda r: run(0.0, "sub", r))
print("\n=== baseline (nothing drifts) ===", flush=True)
for u in ORDER + ["SET"]:
    for sy in ("ALL", "2026-27"):
        n, net = base.get((u, sy), (0, 0))
        print(f"{u:4s} {sy:8s} slips {n:6.0f} net {net:+8.1f} ROI {100 * net / max(n, 1):+6.1f}%", flush=True)
for q in (0.03, 0.06, 0.10):
    print(f"\n=== per-leg drift probability {q:.2f} (a slip of 4 loses a leg {100 * (1 - (1 - q) ** 4):.0f}% of the time) ===", flush=True)
    res = {}
    for pol in ("skip", "drop", "sub"):
        res[pol] = summarize(pol, lambda r, pol=pol: run(q, pol, r))
    res["cut5"] = summarize("cut5", lambda r: run(0.0, "sub", r, 0.95))
    res["cut10"] = summarize("cut10", lambda r: run(0.0, "sub", r, 0.90))
    print("unit season  | baseline net | SKIP net (slips) | DROP net | SUB net | payout x.95 net | payout x.90 net", flush=True)
    for u in ORDER + ["SET"]:
        for sy in ("ALL", "2026-27"):
            b = base.get((u, sy), (0, 0))
            row = [f"{u:4s} {sy:8s} | {b[1]:+8.1f}"]
            for pol in ("skip", "drop", "sub", "cut5", "cut10"):
                n, net = res[pol].get((u, sy), (0, 0))
                row.append(f"{net:+8.1f}" + (f" ({n:.0f})" if pol == "skip" else ""))
            print(" | ".join(row), flush=True)
