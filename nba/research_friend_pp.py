#!/usr/bin/env python3
"""
RESEARCH - FRIEND PAGE, PRIZEPICKS variants (2026-11-05). READ-ONLY.
Second-tier PrizePicks slips: the same families as portfolio B (b1 grid) with a leg-difference cap against the owner's slips of the
slate: at most size - max(1, floor(0.4*size)) legs may be (player, prop, side) used by the owner's slips, so every friend slip differs
from every owner slip by >= 40% of its legs. Flat 1u, Flex for size >= 3 (owner rule), per-season ROI.
"""
import os, sys, itertools
from collections import defaultdict
import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                      # noqa: E402
import research_portfolio_caps as PC          # noqa: E402

HIS = ["B3", "B4", "B5", "B6", "B7", "B9", "B3x4", "B5x4", "B7x4"]
SIZES = (3, 4, 5, 6)
STR = {3: ("flex", "power"), 4: ("flex",), 5: ("flex",), 6: ("flex",)}


def max_dd(x):
    c = np.cumsum(x)
    return float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(x) else 0.0


def dry_run(x):
    best = cur = 0
    for v in x:
        cur = cur + 1 if v <= 0 else 0
        best = max(best, cur)
    return best
POOLS = ("R", "RD")
SIDES = ("O", "U", "B")
PSS = ("all", "lowvol", "points", "rebounds", "combos")
RKS = ("p", "ev", "trail", "blend")
FLS = (0.62, 0.68, 0.72)
GCS = (1, 2)
TPS = (0, 1)
LPS = ("all", "low")


def key(l):
    return (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"])


def lk(l):
    return (str(l["player"]), l["prop"], l["side"])


def need(k):
    return max(1, int(0.4 * k))


def sel(cand, gc, size, H):
    maxh = size - need(size)
    pick, players, games, h = [], set(), defaultdict(int), 0
    for l in cand:
        if l["player"] in players or games[l["event_id"]] >= gc:
            continue
        inh = lk(l) in H
        if inh and h >= maxh:
            continue
        pick.append(l); players.add(l["player"]); games[l["event_id"]] += 1; h += inh
        if len(pick) == size:
            break
    if len(pick) == size and len({l["team_id"] for l in pick}) >= 2:
        return pick
    return None


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    order = sorted(days, key=lambda k: k[1])
    for k in order:
        days[k].sort(key=key)
    PC.L3.attach_ranks(conn, days)
    hk = [k for k in order if k[0] in PC.HIST]
    PC.MX.leg_features(conn, days, hk)
    seasons = sorted({k[0] for k in order})
    print("seasons", seasons, {s: sum(1 for k in order if k[0] == s) for s in seasons}, flush=True)
    combos = list(itertools.product(POOLS, SIDES, PSS, RKS, FLS, GCS, TPS, LPS))
    cols = [(c, (n, st)) for c in combos for n in SIZES for st in STR[n]]
    res = {cn: defaultdict(list) for cn in cols}
    his = defaultdict(lambda: defaultdict(list))
    tr = PB.Trailing()
    for k in order:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        graded = any(l.get("hit") is not None for l in legs)
        prep = PB.prepare(legs, tr.rates())
        if graded:
            H = set()
            for uid in HIS:
                s = PB.unit_slip(prep, uid)
                if s:
                    H |= {lk(l) for l in s}
                    his[uid][k[0]].append(PC.grade(s, PB.UNITS[uid][3]) - 1)
            base = {}
            for (pool, side, ps, rk, fl, gc, tp, lp) in combos:
                bk = (pool, side, ps, rk, lp)
                if bk not in base:
                    b = [l for l in prep if l["tier"] in PB.POOLS[pool] and l["side"] in PB.SIDES[side] and (ps == "all" or l["_grp"] == ps)]
                    if lp == "low":
                        b = [l for l in b if l["_lp"] == "low"]
                    if rk == "p":
                        b = sorted(b, key=lambda l: -l["p"])
                    elif rk == "ev":
                        b = sorted(b, key=lambda l: -l["p"] * float(l["factor"]))
                    elif rk == "blend":
                        b = sorted(b, key=lambda l: -l["_blend"])
                    else:
                        b = sorted(b, key=lambda l: (-l["_trail"], -l["p"]))
                    base[bk] = b
                cand = [l for l in base[bk] if l["p"] >= fl][tp:]
                for n in SIZES:
                    s = sel(cand, gc, n, H)
                    if s:
                        for st in STR[n]:
                            res[((pool, side, ps, rk, fl, gc, tp, lp), (n, st))][k[0]].append(PC.grade(s, st) - 1)
        tr.push(legs)
    print("\nOWNER portfolio (replayed) ROI per season:")
    for uid in HIS:
        print("  ", uid, {s: f"{100*np.mean(v):+.0f}% ({len(v)})" for s, v in his[uid].items()})
    hs = [s for s in seasons if s in ("2024-25", "2025-26")]
    cur = [s for s in seasons if s not in hs]
    for n in SIZES:
        rows = []
        for (c, nn), d in res.items():
            if nn != n:
                continue
            if any(len(d.get(s, [])) < 60 for s in hs):
                continue
            m = [np.mean(d[s]) for s in hs]
            if min(m) <= 0:
                continue
            ce = d.get(cur[0], []) if cur else []
            rows.append((min(m), c, m, {s: len(d[s]) for s in hs}, (np.mean(ce), len(ce)) if ce else None))
        rows.sort(key=lambda r: -r[0])
        print(f"\n=== {n}-pick Flex: {len(rows)} variants positive in both history seasons (leg-diff cap applied); top 25 by weaker season")
        for r in rows[:25]:
            print("  ", r[1], " ".join(f"{100*x:+.0f}%" for x in r[2]), r[3], "this season", ("%+.0f%% (%d)" % (100*r[4][0], r[4][1])) if r[4] else "none")
    print("done")


if __name__ == "__main__":
    main()
