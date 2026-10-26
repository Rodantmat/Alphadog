#!/usr/bin/env python3
"""
PROBE - WHAT THE SLIPS SCREEN SHOWS (2026-10-26, Sleeper deployment check). Reads the deployed NBA UI worker's own Slips API
(/api/slips/high-hit, the screen's data) and prints: the worker version, slips per app, every Sleeper slip (structure, PLAY label,
multiplier / Flex tiers, place-by, legs with line, side, factor, hit probability) and the day's notes. Read-only.
"""
import json
import urllib.request

URL = "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev/api/slips/high-hit"


def main():
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"user-agent": "alphadog-check"}), timeout=120) as r:
        j = json.loads(r.read().decode())
    print("version:", j.get("version"), "| slate:", j.get("slate"), "| source:", j.get("source"))
    sl = j.get("generated_slips") or []
    by = {}
    for s in sl:
        by[s.get("source_key")] = by.get(s.get("source_key"), 0) + 1
    print("slips by app:", by, "| test-only recorded:", j.get("test_only_recorded"))
    for s in sl:
        if s.get("source_key") != "sleeper":
            continue
        print(f"\nSLEEPER {s.get('structure_label')} | {s.get('stake_label')} | x{s.get('estimated_multiplier')} tiers {s.get('estimated_multiplier_flex_tiers')} | place by {s.get('place_by_pt')} | track {s.get('track_label')}")
        for l in s.get("legs") or []:
            print(f"   {l.get('player_name')} {l.get('canonical_prop_key')} {l.get('selected_side')} {l.get('line_value')} @{l.get('leg_factor')} hp {l.get('hit_probability_0_100')}")
    print("\nNOTES:")
    for n in j.get("notes") or []:
        print("  -", n)


if __name__ == "__main__":
    main()
