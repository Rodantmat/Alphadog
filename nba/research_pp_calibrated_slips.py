#!/usr/bin/env python3
"""
RESEARCH - PRIZEPICKS STRATEGIES ON THE CALIBRATED final_hp, EVERY STRUCTURE 2-6 x FLEX / POWER (2026-10-22 night; owner 21:07 PT:
"by tomorrow ... whatever new strategies we must have, considering the board profiles and everything"). READ-ONLY.

Grounding (research first): Stokastic / Action Network / OddsShopper workflows - a leg is played only when its probability clears the
structure's per-leg break-even (2-Power ~57.7%, 6-Power ~54%, Flex 5/6 ~54%), alternates chosen on value not label, independence
helps Flex, negative same-game pairs hurt; Gemini (2.5-pro) consult: with calibrated but weakly-discriminating standard lines, put
volume on goblins in Flex where the calibrated probability clears its own (higher) break-even, diversify many small slips, cap
same-game exposure (<= 2-3 legs of one game in 5/6-pick), choose on one season and test on the other untouched (>= 500 slips).

Legs: every PrizePicks window-board leg of the tier map (nba_score.tier_map_legs, rank_key 'final_hp' -> score = the board-centred
final_hp, walk-forward as of each day), its PrizePicks per-line factor and graded hit, team / event from prop_universe (the slip
engine's own join). final 7 days of each season out (never staked).
A STRATEGY = pool (R: standard lines; G: goblins; GR: both; ALL: + demons) x rank (p = calibrated probability; ev = p x factor) x
minimum p x size 2-6 x Flex / Power x slips a day N (1, 2, 4; a leg in at most L = 2 slips) x same-game cap (1 or 2 legs of one
game). Slips are built greedily from the day's ranked pool (distinct players, >= 2 teams, the game cap, no repeated slip) and
graded by build_slip_engine.grade (grader v3: PrizePicks' tables, alternates' quote tiers, same-game rules, voids revert).
STAGES (owner's order): 1 SAMPLE - the first 40 slates of 2025-26; 2 SEASON - each season alone; 3 TWO SEASONS - chosen on 2024-25
(rank by day-bootstrap 5th-percentile ROI), tested untouched on 2025-26, and the reverse; HOLDS = ROI > 0 and LB5 > 0 in both.
Env: DATABASE_URL, CS_BOOT (400), CS_TOP (25).
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as SE   # noqa: E402

BOOT = int(os.environ.get("CS_BOOT") or 400)
TOP = int(os.environ.get("CS_TOP") or 25)
SEASONS = ("2024-25", "2025-26")
POOLS = {"R": ("R",), "G": ("G1", "G2", "G3"), "GR": ("R", "G1", "G2", "G3"), "ALL": ("R", "G1", "G2", "G3", "D1", "D2", "D3")}
MINP = (0.0, 0.55, 0.60, 0.65, 0.70)
SIZES = (2, 3, 4, 5, 6)
NS = (1, 2, 4)
GAMECAP = (1, 2)
LEGCAP = 2

LEG_SQL = """
SELECT l.season, l.game_date, l.player, l.prop, l.tier, l.side, l.line::float8, l.factor::float8, l.hit, l.score::float8,
       pu.team_id, pu.event_id
FROM nba_score.tier_map_legs l
JOIN nba_market.prop_universe pu ON pu.game_date = l.game_date AND pu.player = l.player AND pu.prop = l.prop AND pu.side = l.side
                                 AND pu.line = l.line AND pu.line_source = 'real'
WHERE l.rank_key = 'final_hp' AND l.season = ANY(%s) AND l.factor IS NOT NULL"""


def load(conn):
    days = defaultdict(list)
    for s, d, pl, pr, t, sd, ln, f, h, p, tm, ev in conn.execute(LEG_SQL, (list(SEASONS),)):
        days[(s, d)].append({"player": pl, "prop": pr, "tier": t, "side": sd, "line": ln, "factor": f, "hit": h, "p": p,
                             "team_id": tm, "event_id": ev, "cell": f"{pr}_{t}"})
    bounds = {}
    for (s, d) in days:
        lo, hi = bounds.get(s, (d, d)); bounds[s] = (min(lo, d), max(hi, d))
    keep = {k: v for k, v in days.items() if (bounds[k[0]][1] - k[1]).days > 7}
    return keep


_SORTED = {}


def ranked(legs_key, legs, pool, rank):
    """the day's pool ordered by the rank, cached per (day, pool, rank)"""
    k = (legs_key, pool, rank)
    if k not in _SORTED:
        cand = [l for l in legs if l["tier"] in POOLS[pool] and l["team_id"] is not None and l["p"] is not None]
        cand.sort(key=(lambda l: -l["p"]) if rank == "p" else (lambda l: -l["p"] * l["factor"]))
        _SORTED[k] = cand
    return _SORTED[k]


def build(day_key, legs, pool, rank, minp, size, n, gamecap):
    cand = [l for l in ranked(day_key, legs, pool, rank) if l["p"] >= minp]
    used = defaultdict(int)
    slips, seen = [], set()
    for _ in range(n):
        s, players, games = [], set(), defaultdict(int)
        for l in cand:
            if used[id(l)] >= LEGCAP or l["player"] in players or games[l["event_id"]] >= gamecap:
                continue
            s.append(l); players.add(l["player"]); games[l["event_id"]] += 1
            if len(s) == size:
                break
        if len(s) < size or len({l["team_id"] for l in s}) < 2:
            break
        sig = tuple(sorted(id(l) for l in s))
        if sig in seen:
            break
        seen.add(sig)
        for l in s:
            used[id(l)] += 1
        slips.append(s)
    return slips


def boot_lb(daily, reps=BOOT, seed=11):
    """day-blocked bootstrap 5th percentile of ROI; daily = [(stake, profit)]"""
    if len(daily) < 10:
        return float("nan")
    a = np.array(daily, float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(a), size=(reps, len(a)))
    st, pf = a[idx, 0].sum(1), a[idx, 1].sum(1)
    return float(np.percentile(pf / np.maximum(st, 1e-9), 5))


def evaluate(days, keys, cfg):
    pool, rank, minp, size, structure, n, gc = cfg
    daily, slips_n, hits = [], 0, 0
    eq, peak, dd = 0.0, 0.0, 0.0
    for k in keys:
        sl = build(k, days[k], pool, rank, minp, size, n, gc)
        if not sl:
            continue
        st = pf = 0.0
        for s in sl:
            h, pay = SE.grade(s, structure)
            st += 1.0; pf += pay - 1.0; slips_n += 1; hits += int(h == len(s))
        daily.append((st, pf))
        eq += pf; peak = max(peak, eq); dd = max(dd, peak - eq)
    stake = sum(x[0] for x in daily)
    roi = sum(x[1] for x in daily) / stake if stake else float("nan")
    return {"roi": roi, "lb": boot_lb(daily), "slips": slips_n, "days": len(daily), "allhit": hits / slips_n if slips_n else float("nan"),
            "dd": dd}


def fmt(r):
    return (f"ROI {r['roi']:+7.1%} lb5 {r['lb']:+7.1%} slips {r['slips']:>5} days {r['days']:>3} all-hit {r['allhit']:.3f} "
            f"maxdd {r['dd']:5.1f}u")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()   # load PrizePicks' tiers / v3 rules once (the grader reads them)
    days = load(conn)
    by_season = {s: sorted(k for k in days if k[0] == s) for s in SEASONS}
    print("legs per season: " + ", ".join(f"{s} {sum(len(days[k]) for k in v):,} on {len(v)} slates" for s, v in by_season.items()), flush=True)
    for s, v in by_season.items():
        allp = [l for k in v for l in days[k]]
        for pool in POOLS:
            sel = [l for l in allp if l["tier"] in POOLS[pool]]
            for mp in (0.55, 0.60, 0.65, 0.70):
                ss = [l for l in sel if l["p"] >= mp]
                if ss:
                    print(f"  {s} pool {pool:<3} p >= {mp:.2f}: legs {len(ss):>7,} ({len(ss) / len(v):6.1f}/day) mean p {np.mean([l['p'] for l in ss]):.3f} "
                          f"hit {np.mean([l['hit'] for l in ss if l['hit'] is not None]):.3f} mean factor {np.mean([l['factor'] for l in ss]):.3f}")
    cfgs = [(pool, rank, mp, size, st, n, gc) for pool in POOLS for rank in ("p", "ev") for mp in MINP for size in SIZES
            for st in ("flex", "power") for n in NS for gc in GAMECAP
            if not (st == "flex" and size == 2)]
    print(f"\n{len(cfgs)} strategies x 2 seasons", flush=True)

    print("\nSTAGE 1 - SAMPLE: first 40 slates of 2025-26 (top 15 by lb5)")
    s1 = by_season["2025-26"][:40]
    res1 = sorted(((evaluate(days, s1, c), c) for c in cfgs), key=lambda x: -(x[0]["lb"] if x[0]["lb"] == x[0]["lb"] else -9))
    for r, c in res1[:15]:
        print(f"  {c}  {fmt(r)}")

    print("\nSTAGE 2 / 3 - each season; chosen on one, tested untouched on the other")
    R = {s: {c: evaluate(days, by_season[s], c) for c in cfgs} for s in SEASONS}
    for a, b in (SEASONS, SEASONS[::-1]):
        order = sorted(cfgs, key=lambda c: -(R[a][c]["lb"] if R[a][c]["lb"] == R[a][c]["lb"] else -9))
        print(f"\n  chosen on {a} (top {TOP} by lb5) -> tested on {b}")
        for c in order[:TOP]:
            print(f"    {str(c):<52} {a}: {fmt(R[a][c])} | {b}: {fmt(R[b][c])}")
    print("\n  HOLDS in both seasons (ROI > 0 and lb5 > 0 in each), by the weaker lb5")
    holds = [c for c in cfgs if all(R[s][c]["roi"] > 0 and R[s][c]["lb"] > 0 for s in SEASONS)]
    holds.sort(key=lambda c: -min(R[s][c]["lb"] for s in SEASONS))
    for c in holds[:60]:
        print(f"    {str(c):<52} " + " | ".join(f"{s}: {fmt(R[s][c])}" for s in SEASONS))
    print(f"  {len(holds)} of {len(cfgs)} hold")
    print("\n  best per structure (size x Flex / Power) by the weaker season's lb5, whatever holds")
    for size in SIZES:
        for st in ("flex", "power"):
            cc = [c for c in cfgs if c[3] == size and c[4] == st]
            if not cc:
                continue
            c = max(cc, key=lambda c: min((R[s][c]["lb"] if R[s][c]["lb"] == R[s][c]["lb"] else -9) for s in SEASONS))
            print(f"    {size}-{st:<5} {str(c):<52} " + " | ".join(f"{s}: {fmt(R[s][c])}" for s in SEASONS))


if __name__ == "__main__":
    main()
