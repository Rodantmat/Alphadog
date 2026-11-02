#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner 19:57 PT: picks no book prices - penalty?). READ-ONLY. Every leg of this season's real Betr boards exactly as
the live engine sees it (betr_live_slip_engine.board_legs, started-game guard off), graded: priced (the books post that exact line,
pf from RSD.load) vs UNPRICED (pf defaulted to 0.5), by final_hp zone and prop - mean final_hp vs realised hit. Env: DATABASE_URL."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "betr")
import psycopg  # noqa: E402

import betr_live_slip_engine as E  # noqa: E402

AF = E.AF


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    days = [d for d in AF.slate_days(conn) if AF.season_of(d) == "2026-27"]
    acc = defaultdict(lambda: [0, 0.0, 0.0])
    for d in days:
        st = AF.box(conn, d)
        if not st:
            continue
        legs, last, _w = E.board_legs(conn, d, guard=False)
        if last is None:
            continue
        for l in legs:
            h = AF.outcome(st, l)
            if h is None:
                continue
            pr = "priced" if l["pf"] != 0.5 else "UNPRICED"
            z = "p>=.60" if l["p"] >= 0.60 else ".50-.60" if l["p"] >= 0.50 else "<.50"
            for key in ((pr, z, "ALL"), (pr, z, l["prop"])):
                a = acc[key]; a[0] += 1; a[1] += l["p"]; a[2] += float(h)
    for z in ("p>=.60", ".50-.60", "<.50"):
        print(f"\nzone {z}")
        props = sorted({k[2] for k in acc if k[1] == z}, key=lambda x: (x != "ALL", x))
        for prop in props:
            s = []
            for pr in ("priced", "UNPRICED"):
                n, sp, sy = acc.get((pr, z, prop), [0, 0, 0])
                s.append(f"{pr:8s} n {n:5d} hp {sp / n:.3f} hit {sy / n:.3f} gap {(sy - sp) / n:+.3f}" if n else f"{pr:8s} n     0")
            print(f"  {prop:12s} " + " | ".join(s), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
