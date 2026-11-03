#!/usr/bin/env python3
"""AUDIT - PORTFOLIO B's U4 UNIT: LIVE = RESEARCH (2026-11-03, owner 2026-11-02 22:25 PT "Add it, I like it"). READ-ONLY.
On every slate of 2024-25, 2025-26 (final 7 days out) and this season: the live path (live_slip_engine.load_board_legs_live ->
the calibrated pool as pick() builds it -> pb_last10 -> portfolio_b.attach_aedge -> prepare -> unit_slip('U4')) must build the SAME
slip as the research (research_pp_candidates.cand_slip on research_pp_universe.load legs). Then U4's ROI per period on the live
path, and a DRY RUN of the latest graded slate's board: every pp_portfolio unit + U4 as pick() would build them (nothing written).
Env: DATABASE_URL."""
import os
import sys

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import build_slip_engine as SE                       # noqa: E402
import live_slip_engine as L                         # noqa: E402
import portfolio_b as PB                             # noqa: E402
import research_pp_candidates as RC                  # noqa: E402
import research_pp_universe as U                     # noqa: E402


def key(s):
    return None if s is None else sorted((str(l["player"]), l["prop"], l["side"], float(l["line"])) for l in s)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    SE.flex_alt_tiers(); SE.payout_v3_rules()
    slates = U.load(conn)
    conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    same = diff = 0
    roi = {s: [] for s in U.PERIODS}
    for i, (s, d, rlegs) in enumerate(slates):
        rs = RC.cand_slip(rlegs, RC.CANDS["U4"])
        live = L.load_board_legs_live(conn, d)
        pool = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in live
                if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        PB.attach_aedge(pool, L.pb_last10(conn, d, {l["player_id"] for l in pool}))
        es = PB.unit_slip(PB.prepare(pool, {}), "U4")
        if key(rs) == key(es):
            same += 1
        else:
            diff += 1
            print(f"  {d} DIFF\n    live:     {key(es)}\n    research: {key(rs)}", flush=True)
        if rs is not None:
            roi[s].append(U.grade(rs, "power") - 1.0)
        if i % 40 == 39:
            conn.close(); conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    print(f"\nPARITY U4: {same} of {same + diff} slates build the same slip -> {'ALL PASS' if not diff else 'DIFFERENCES ABOVE'}")
    for s in U.PERIODS:
        print(f"  U4 {s}: {len(roi[s])} slips, ROI {100 * np.mean(roi[s]) if roi[s] else 0:+.1f}%")
    # dry run on the latest slate with a board
    d = slates[-1][1]
    live = L.load_board_legs_live(conn, d)
    pool = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in live
            if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
    PB.attach_aedge(pool, L.pb_last10(conn, d, {l["player_id"] for l in pool}))
    prep = PB.prepare(pool, L.pb_rates(conn, d))
    print(f"\nDRY RUN {d} (nothing written):")
    for uid in ("B3", "B4", "B5", "B6", "B7", "B9", "U4"):
        sl = PB.unit_slip(prep, uid)
        print(f"  {uid}: " + ("no slip" if sl is None else " + ".join(f"{l['player']} {l['prop']} {l['side']} {l['line']} (fh {float(l['p']):.2f}"
                                                                     f"{', aedge %+.2f' % l['_aedge'] if uid == 'U4' else ''})" for l in sl)), flush=True)


if __name__ == "__main__":
    main()
