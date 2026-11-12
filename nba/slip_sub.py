#!/usr/bin/env python3
"""
SUB THE NEXT RANKED CANDIDATE (owner 2026-11-12 00:03 PT: "All strategies should work with sub the next ranked candidate").
Pure helper used by the PrizePicks slip-quote step (pp_payout_map.py, mode slipq): a slip with a leg that is no longer on PrizePicks' board as built (pulled / moved /
other line type) gets that leg replaced by the NEXT RANKED CANDIDATE of its own unit (nba_score.slip_next_legs, written by live_slip_engine at pick time in the unit's own
order) that IS on the board, is a distinct player (also from the unit's other slips), respects the unit's game cap and keeps two teams. The remaining legs keep their place.
Only when no candidate fits does the caller fall back to the quote gate's older repair (drop the leg). Measured on the PrizePicks replay (research_cert_drift_pp, 30 seeds):
sub keeps 91% of the profit at a 6% leg drift (drop 87%, skip the slip 76%).
"""
from collections import Counter


def sub_missing(legs, miss_idx, cands, on_board, gc, taken_players, norm):
    """legs: the slip's leg dicts (build order); miss_idx: indexes of the legs not on the board; cands: ranked candidate leg dicts (may carry team_id);
    on_board(leg) -> True when the leg maps to a PrizePicks board row; gc: the unit's legs-a-game cap; taken_players: normalised names that must not be reused
    (the unit's other slips); norm: name normaliser. Returns (new_legs, [(old, new)]) or (None, []) when some missing leg has no candidate."""
    kept = [l for i, l in enumerate(legs) if i not in miss_idx]
    used = {norm(l.get("player")) for l in legs} | set(taken_players)
    games = Counter(l.get("event_id") for l in kept if l.get("event_id") is not None)
    team_of = {norm(c.get("player")): c.get("team_id") for c in cands}
    teams = {team_of.get(norm(l.get("player"))) for l in kept}
    new_legs, pairs = list(legs), []
    for i in sorted(miss_idx):
        got = None
        for c in cands:
            if norm(c.get("player")) in used:
                continue
            if c.get("event_id") is not None and games[c["event_id"]] >= gc:
                continue
            if not on_board(c):
                continue
            got = c
            break
        if got is None:
            return None, []
        leg = {k: v for k, v in got.items() if k != "team_id"}
        pairs.append((legs[i], leg))
        new_legs[i] = leg
        used.add(norm(got.get("player")))
        if got.get("event_id") is not None:
            games[got["event_id"]] += 1
        teams.add(got.get("team_id"))
    if None not in teams and len(teams) < 2:
        return None, []                       # every team is known and all legs are one team: not a valid slip
    return new_legs, pairs
