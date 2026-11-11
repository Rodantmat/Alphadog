#!/usr/bin/env python3
"""RESEARCH - RAW HIT-RATE MATRIX (2026-11-10, owner: "hit rate for all the prop line variations, for more and for less ... does plain hit rate hold
a good ROI without even using the internal numbers"). READ-ONLY. NO final_hp / score / confidence is used to select anything: every graded board leg
of the live engine's board (research_calib_audit.load, box-score grader, 12 props) is counted by prop x line variation (R standard, G1-G3 goblin
rungs, D1-D3 demon rungs) x side (Over = More, Under = Less), per season 2024-25 / 2025-26 / 2026-27.
Per cell: n, hit rate, and the edge over the per-leg break-even of the common structures (2-pick Power 3x -> .5774; 3-pick Power 5x -> .5848;
4-pick Power 10x -> .5623; 5-pick Power 20x -> .5493; 6-pick Power 37.5x -> .5435; 2-pick Flex ~ .5774 area) - the standard-line cells are the ones a slip
can use at regular multipliers; goblin / demon rungs pay different per-leg prices, so for them the hit rate is shown against the rung's own implied
chance (what a fair price needs) = mean of the line's no-vig where known is NOT used here (no internal numbers).
Sections: 1 standard lines by prop x side; 2 every line variation pooled over props x side; 3 prop x variation x side (n >= 400 in a season);
4 cells with hit >= .58 and n >= 300 in BOTH history seasons (stable) with this season's number beside; 5 same by line value bucket for points / rebounds / assists / threes.
Env: DATABASE_URL.
"""
import os
import sys
from collections import defaultdict

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_calib_audit as CA  # noqa: E402

BE = {"2P": 0.5774, "3P": 0.5848, "4P": 0.5623, "5P": 0.5493, "6P": 0.5435}


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    slates = CA.load(conn)
    conn.close()
    cell = defaultdict(lambda: defaultdict(lambda: [0, 0]))   # (prop, tier, side) -> season -> [n, hits]
    for s, _d, ls in slates:
        for l in ls:
            if l["hit"] is None:
                continue
            for prop in (l["prop"], "ALL"):
                c = cell[(prop, l["tier"], l["side"])][s]
                c[0] += 1; c[1] += int(l["hit"])
    tiers = ["R", "G1", "G2", "G3", "D1", "D2", "D3"]
    props = sorted({k[0] for k in cell if k[0] != "ALL"})

    def txt(prop, t, sd):
        v = cell.get((prop, t, sd))
        if not v:
            return "     -     "
        parts = []
        for s in CA.PERIODS:
            n, h = v.get(s, [0, 0])
            parts.append(f"{100 * h / n:4.1f}[{n:5d}]" if n >= 150 else "   n/a      ")
        return " ".join(parts)

    print("\n" + "=" * 150 + "\nSECTION 1+2 - hit rate % [n], columns 2024-25 | 2025-26 | 2026-27; break-evens per leg: " + ", ".join(f"{k} {100 * v:.1f}" for k, v in BE.items()))
    print(f"{'prop / variation':<22}" + " | ".join(f"{sd:^{3 * 12 + 2}}" for sd in ("Over (More)", "Under (Less)")))
    for prop in ["ALL"] + props:
        print(f"-- {prop}")
        for t in tiers:
            if (prop, t, "Over") in cell or (prop, t, "Under") in cell:
                print(f"   {t:<4}              " + txt(prop, t, "Over") + " | " + txt(prop, t, "Under"))
    print("\n" + "=" * 150 + "\nSECTION 4 - STABLE cells: hit >= 58.0% and n >= 300 in BOTH history seasons (this season beside it). Plain hit rate, no internal number involved")
    rows = []
    for (prop, t, sd), v in cell.items():
        if prop == "ALL" and False:
            continue
        a, b, c = v.get("2024-25", [0, 0]), v.get("2025-26", [0, 0]), v.get("2026-27", [0, 0])
        if a[0] >= 300 and b[0] >= 300 and a[1] / a[0] >= 0.58 and b[1] / b[0] >= 0.58:
            rows.append((min(a[1] / a[0], b[1] / b[0]), prop, t, sd, a, b, c))
    for _m, prop, t, sd, a, b, c in sorted(rows, reverse=True):
        cs = f"{100 * c[1] / c[0]:.1f}[{c[0]}]" if c[0] >= 50 else "n/a"
        print(f"  {prop:<12} {t:<3} {sd:<6} 24-25 {100 * a[1] / a[0]:.1f}[{a[0]}] | 25-26 {100 * b[1] / b[0]:.1f}[{b[0]}] | 26-27 {cs}")
    if not rows:
        print("  none")
    print("\n" + "=" * 150 + "\nSECTION 5 - standard lines by line value (points / rebounds / assists / threes), hit % [n] per season, Over | Under")
    val = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for s, _d, ls in slates:
        for l in ls:
            if l["hit"] is None or l["tier"] != "R" or l["prop"] not in ("points", "rebounds", "assists", "threes_made"):
                continue
            val[(l["prop"], l["line"], l["side"])][s][0] += 1
            val[(l["prop"], l["line"], l["side"])][s][1] += int(l["hit"])
    for prop in ("points", "rebounds", "assists", "threes_made"):
        lines = sorted({k[1] for k in val if k[0] == prop})
        print(f"-- {prop}")
        for ln in lines:
            def t(sd):
                v = val.get((prop, ln, sd))
                if not v:
                    return " " * 36
                return " ".join((f"{100 * v[s][1] / v[s][0]:4.1f}[{v[s][0]:5d}]" if v[s][0] >= 150 else "   n/a      ") for s in CA.PERIODS)
            if sum(val.get((prop, ln, "Over"), {}).get(s, [0])[0] for s in CA.PERIODS) >= 300:
                print(f"   line {ln:>5}: " + t("Over") + " | " + t("Under"))
    CA.log("DONE")


if __name__ == "__main__":
    main()
