#!/usr/bin/env python3
"""RESEARCH (2026-11-01): the live Betr-board cascade (B_BRD_4dyn, else B_BRD_3dyn_fb) on this season's real boards, as live now vs
REQUIRING a book price on every leg (the books post that exact line - the only kind of leg the 2-season history contains). READ-ONLY.
Env: DATABASE_URL."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("ST_APP", "betr")
import psycopg  # noqa: E402

import betr_live_slip_engine as E  # noqa: E402

RULES = [{"name": "B_BRD_4dyn", "k": 4, "order": "bl", "side": "mix", "game_cap": 1, "floor": 0.60, "slips": 2},
         {"name": "B_BRD_3dyn_fb", "k": 3, "order": "bl", "side": "mix", "game_cap": 2, "floor": 0.60, "slips": 2}]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    days = [d for d in E.AF.slate_days(conn) if E.AF.season_of(d) == "2026-27"]
    tot = {}
    for variant in ("as live", "priced only"):
        n = pl = hits = legs_n = 0
        lines = []
        for d in days:
            st = E.AF.box(conn, d)
            if not st:
                continue
            legs, last, _w = E.board_legs(conn, d, guard=False)
            if last is None:
                continue
            for l in legs:
                l["hit"] = E.AF.outcome(st, l)
            if variant == "priced only":
                legs = [l for l in legs if l["pf"] != 0.5]
            built = None
            for r in RULES:
                s = E.select(legs, r)
                if s:
                    built = (r["name"], s); break
            if not built:
                lines.append(f"  {d}: nothing"); continue
            p = [E.ST.pay_betr(s, True) - 1 for s in built[1]]
            n += len(p); pl += sum(p)
            for s in built[1]:
                hits += sum(1 for l in s if l["hit"]); legs_n += sum(1 for l in s if l["hit"] is not None)
            unpr = sum(1 for s in built[1] for l in s if l["pf"] == 0.5)
            lines.append(f"  {d} {built[0]}: {len(p)} slip(s) P/L {sum(p):+.2f}u (unpriced legs {unpr})")
        tot[variant] = (n, pl, hits, legs_n)
        print(f"\n{variant.upper()}\n" + "\n".join(lines), flush=True)
    for v, (n, pl, h, ln) in tot.items():
        print(f"{v:12s}: {n} slips, P/L {pl:+.2f}u, ROI {100 * pl / n if n else 0:+.1f}%, legs hit {h}/{ln} ({100 * h / ln if ln else 0:.1f}%)", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
