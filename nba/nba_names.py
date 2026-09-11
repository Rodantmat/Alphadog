#!/usr/bin/env python3
"""
Shared NBA player-name resolution.

THE PROBLEM: sportsbooks and DFS apps use nicknames the NBA register does not.
  board "Herb Jones"       vs register "Herbert Jones"
  board "Nicolas Claxton"  vs register "Nic Claxton"
  board "Moe Wagner"       vs register "Moritz Wagner"
A silent mismatch is worse than a loud one: in the grader it would have marked 1,404 legs as
scratches; in the scoring engine it would drop the player from the slate. Every component that
joins board names to NBA data MUST import from here so the mapping cannot drift between them.

Resolution order: exact -> explicit override -> unambiguous (name suffix + first initial) alias.
The alias step only fires when exactly one active player matches, so it can never silently pick
the wrong player; ambiguous cases fall through unresolved and are reported, not guessed.
"""
import json
import re
import unicodedata
import urllib.request
from collections import defaultdict

RAW_DEFAULT = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"

# Confirmed board-name -> register-name pairs (normalized on both sides).
NAME_OVERRIDES = {
    "herbjones": "herbertjones",
    "nicolasclaxton": "nicclaxton",
    "moewagner": "moritzwagner",
    "cammthomas": "camthomas",
    "gregjackson": "gregoryjacksoniii",
    "jimmybutleriii": "jimmybutler",
    "kellyoubre": "kellyoubrejr",
}


def norm_name(s):
    """Lowercase, strip accents, drop suffixes and punctuation: 'Luka Dončić' -> 'lukadoncic'."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def load_player_index(raw_base=RAW_DEFAULT, timeout=120):
    """PERSON_ID -> normalized name, plus the set of all known normalized names."""
    url = raw_base + "nba_all_players.json"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "alphadog"}), timeout=timeout) as r:
        doc = json.load(r)
    by_id, names = {}, set()
    for x in doc.get("records") or []:
        nm = norm_name(x.get("DISPLAY_FIRST_LAST"))
        if nm:
            by_id[str(x.get("PERSON_ID"))] = nm
            names.add(nm)
    return by_id, names


def build_alias_index(active_names):
    """(name suffix, first initial) -> name, for the players active in the relevant season.
    Only unambiguous keys are kept, so a lookup can never resolve to the wrong player."""
    idx = defaultdict(set)
    for nm in active_names:
        if len(nm) >= 6:
            idx[(nm[-6:], nm[0])].add(nm)
    return {k: next(iter(v)) for k, v in idx.items() if len(v) == 1}


def resolve(board_name, candidates, alias_idx=None):
    """Resolve a board name against a container of known names (dict or set).
    Returns (resolved_name_or_None, how) where how is exact|override|alias|none."""
    nm = board_name if isinstance(board_name, str) and nm_is_normalized(board_name) else norm_name(board_name)
    if nm in candidates:
        return nm, "exact"
    ov = NAME_OVERRIDES.get(nm)
    if ov and ov in candidates:
        return ov, "override"
    if alias_idx and len(nm) >= 6:
        cand = alias_idx.get((nm[-6:], nm[0]))
        if cand and cand in candidates:
            return cand, "alias"
    return None, "none"


def nm_is_normalized(s):
    return bool(s) and s == re.sub(r"[^a-z]", "", s)
