#!/usr/bin/env python3
"""CERTIFICATION - the owner's Fliff Pick'Em strategies (F_UDT1_2max_U main, F_UDT1_3max_U_pm, F_UDT1_2max_fav) on the research_fliff_transfer harness: Underdog T1's qualified legs priced at
Fliff's own line and multiplier. History (2024-25, 2025-26) = the books' consensus main line x the measured Pick'Em margin (K_F 1.0971) = MODELLED boards; 2026-27 = Fliff's real
Pick'Em board (sportsbook feed 10-20..10-25). Max = product of the multipliers. READ-ONLY, flat 1u a slip. Reports ROI, net, drawdown, drought like the PrizePicks / Underdog tables."""
import datetime as dt
import os
import sys

os.environ.setdefault("FT_PART", "ud")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_fliff_transfer as FT       # noqa: E402
import research_cert_common as CC          # noqa: E402

ST = FT.ST
KEYS = {
    "F_UDT1_2max_U  (2-pick Max, Under, T1 order, p>=.56, m<=1.85, 1 slip)": ("UD-T1", "src", 0.56, "Under", 1.85, 0, 1, 2, "max"),
    "F_UDT1_3max_U_pm (3-pick Max, Under, p x m order, 2 slips)": ("UD-T1", "pm", 0.0, "Under", 99.0, 0, 2, 3, "max"),
    "F_UDT1_2max_fav (2-pick Max, favourites, p>=.56, 2 slips)": ("UD-T1", "fav", 0.56, "any", 99.0, 0, 2, 2, "max"),
    "reference F_T1_2max (retired: p order, skip 1, any side)": ("UD-T1", "p", 0.56, "any", 1.85, 1, 1, 2, "max"),
}


def main():
    conn = ST.connect()
    bk = FT.Book()
    today = dt.datetime.now(ST.AF.UDL.PT).date()
    cur = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
    early = [d for d in cur if d < dt.date(2026, 10, 26)]
    pick = [d for d in cur if d >= dt.date(2026, 10, 26)]
    days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
    conn = ST.run_ud(conn, days, ST.HistPricer, bk)
    conn = ST.run_ud(conn, early, ST.LiveFliffPricer, bk)
    conn = ST.run_ud(conn, pick, FT.PickemPricer, bk)
    print(f"slips keys: {len(bk.slips)}; real-board slates {len(pick)} (+{len(early)} sportsbook-feed slates before the Pick'Em capture)", flush=True)
    print("\n=== owner Fliff units ===", flush=True)
    for name, key in KEYS.items():
        v = bk.slips.get(key, [])
        if not v:
            print(f"{name}: no slips in the grid", flush=True)
            continue
        CC.report(f"FLIFF {name}"[:60], [(s, d, p - 1.0, False) for (s, d, p) in v])
    print("done", flush=True)


if __name__ == "__main__":
    main()
