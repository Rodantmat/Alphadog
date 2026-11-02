#!/usr/bin/env python3
"""RESEARCH (2026-11-01, owner 22:47 PT: "Do a deep analysis on underdog"). READ-ONLY. Underdog's legs as the live engine and the deep
review load them (research_app_final_strategies.load_ud: final_hp at Underdog's line, payout factor m, line level R / F1-3 / B1-3),
graded - model vs realised by line level, side, prop group and final_hp zone, HISTORY vs THIS SEASON, plus the legs portfolio T would
rank highest (final_hp x m, >= .55 / .60). Question: is it the leg TYPES T uses (harder B lines, More, combos, ranked by p x m) that
fail this season, while Underdog's legs as a whole stay calibrated? Env: DATABASE_URL, LT_SMOKE (1 = every 4th history slate)."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import psycopg  # noqa: E402

import research_app_final_strategies as AF  # noqa: E402

GRP = {"points": "points", "rebounds": "rebounds", "assists": "assists", "threes_made": "threes", "pra": "combos", "pts_reb": "combos",
       "pts_ast": "combos", "reb_ast": "combos", "steals": "lowvol", "blocks": "lowvol", "turnovers": "lowvol", "stocks": "lowvol"}


def zone(p):
    return ".55-.60" if p < .60 else ".60-.65" if p < .65 else ".65-.70" if p < .70 else ".70+"


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    hist = [d for d in days if AF.season_of(d) != "2026-27"]
    if os.environ.get("LT_SMOKE") == "1":
        hist = hist[::4]
    live = [d for d in days if AF.season_of(d) == "2026-27"]
    acc = defaultdict(lambda: [0, 0.0, 0.0, 0.0])            # n, sum p, sum hit, sum return (hit x m - 1 for a 1-leg view)
    for i, d in enumerate(hist + live):
        per = "this season" if AF.season_of(d) == "2026-27" else "history"
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _rows = AF.load_ud(conn, d, st)
        for l in legs:
            if l.get("hit") is None or l["p"] < 0.55:
                continue
            h = float(l["hit"])
            lvl = "R" if l["tier"] == "R" else ("B" if str(l["tier"]).startswith("B") else "F" if str(l["tier"]).startswith("F") else str(l["tier"]))
            keys = [("ALL",), ("level", lvl), ("side", l["side"]), ("group", GRP.get(l["prop"], "?")), ("zone", zone(l["p"])),
                    ("level x side", f"{lvl} {l['side']}"), ("level x zone", f"{lvl} {zone(l['p'])}"),
                    ("T2-like: R/B, both sides, p >= .60", "yes" if lvl in ("R", "B") and l["p"] >= .60 else "no"),
                    ("T3-like: R/B, More, combos, p >= .55", "yes" if lvl in ("R", "B") and l["side"] == "Over" and GRP.get(l["prop"]) == "combos" else "no")]
            for k in keys:
                a = acc[(per,) + k]; a[0] += 1; a[1] += l["p"]; a[2] += h; a[3] += h * l["m"]
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
        if i % 50 == 0:
            print(f"  slate {i + 1}/{len(hist) + len(live)} {d}", flush=True)
    print("\nUNDERDOG LEGS, final_hp >= .55: n | mean final_hp | realised hit | gap | mean (hit x factor) - the per-leg payout-weighted rate")
    dims = sorted({k[1:] for k in acc if len(k) > 1}, key=lambda x: (x[0] != "ALL", x))
    for dim in dims:
        s = []
        for per in ("history", "this season"):
            n, sp, sh, sr = acc.get((per,) + dim, [0, 0, 0, 0])
            s.append(f"{per:11s} n {n:7,d} hp {sp / n:.3f} hit {sh / n:.3f} gap {(sh - sp) / n:+.3f} hit x m {sr / n:.3f}" if n else f"{per:11s} n 0")
        print(f"  {' / '.join(dim):45s} " + " | ".join(s), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
