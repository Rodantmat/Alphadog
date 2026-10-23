#!/usr/bin/env python3
"""
CALIBRATED-POOL SLIPS - the one slip builder shared by the research (research_pp_calibrated_slips.py) and the live pick
(live_slip_engine portfolio units 'calib:...'), so what was measured is exactly what is placed (2026-10-23; owner 21:07 PT:
new strategies on the board-centred final_hp by the next slate).

A unit spec 'calib:<pool>:<rank>:<minp>:<gamecap>':
  pool    R (standard lines) | G (goblins G1-G3) | GR (both) | ALL (+ demons D1-D3) - the leg's tier is PrizePicks' own label
  rank    p (the calibrated final_hp) | ev (final_hp x the leg's PrizePicks factor)
  minp    the leg's final_hp must be >= minp
  gamecap at most this many legs of one game in a slip
Slips: greedy from the ranked pool - distinct players, the game cap, >= 2 teams, a leg in at most LEGCAP slips, no repeated slip;
the k-th slip is built after the first k-1 took their legs.
"""
from collections import defaultdict

POOLS = {"R": ("R",), "G": ("G1", "G2", "G3"), "GR": ("R", "G1", "G2", "G3"), "ALL": ("R", "G1", "G2", "G3", "D1", "D2", "D3")}
LEGCAP = 2


def parse(comp):
    _, pool, rank, minp, gamecap = comp.split(":")
    if pool not in POOLS or rank not in ("p", "ev"):
        raise ValueError(f"bad calibrated unit {comp!r}")
    return pool, rank, float(minp), int(gamecap)


def rank_pool(legs, pool, rank):
    """legs: dicts with tier, p (calibrated probability), factor, team_id, event_id, player"""
    cand = [l for l in legs if l["tier"] in POOLS[pool] and l.get("team_id") is not None and l.get("p") is not None]
    cand.sort(key=(lambda l: -l["p"]) if rank == "p" else (lambda l: -l["p"] * l["factor"]))
    return cand


def build(ranked, minp, size, n, gamecap, legcap=LEGCAP):
    cand = [l for l in ranked if l["p"] >= minp]
    used = defaultdict(int)
    slips, seen = [], set()
    for _ in range(n):
        s, players, games = [], set(), defaultdict(int)
        for l in cand:
            if used[id(l)] >= legcap or l["player"] in players or games[l["event_id"]] >= gamecap:
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


def unit_slips(legs, comp, size, n):
    pool, rank, minp, gamecap = parse(comp)
    return build(rank_pool(legs, pool, rank), minp, size, n, gamecap)
