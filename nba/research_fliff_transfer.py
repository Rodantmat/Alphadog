#!/usr/bin/env python3
"""
RESEARCH - FLIFF PICK'EM: THE OTHER APPS' CERTIFIED LEGS PLAYED ON FLIFF AT FLIFF'S OWN LINE AND MULTIPLIER (2026-10-28; owner 16:03
PT: "Keep researching fliff, I am sure something positive is there, even if it just copies the strategy of another app with its own
multipliers"). READ-ONLY.

SOURCES (the certified live strategies' qualified legs, their own builders - research_sleeper_transfer): Underdog portfolio T units
T1 / T2 / T3 and PrizePicks portfolio B units B3 B4 B5 B6 B7 B9.
FLIFF PRICE: history (2024-25, 2025-26) = the books' consensus MAIN line, m = round(1 / (K_F x p_mkt), 3) with K_F = 1.0971 - the
Pick'Em board's own margin measured against the books at the same line (research_app_allegs run 40778667250, 2,454 legs, p10 1.071 /
p90 1.122); this season = Fliff's REAL Pick'Em board (nba_market.fliff_pickem_board, 2026-10-26 on), its line and multiplier; 10-20..10-25 (before
  the Pick'Em capture) Fliff's sportsbook main lines and prices, the feed Pick'Em copies.
PAYOUT: Max = product of the multipliers (Fliff Pick'Em rules v2.0; the app's cut to 2 decimals is not modelled - < 0.5%); a void drops the
pick, < 2 live picks = refund. Flex reductions unpublished - not priced.
GRID (research_sleeper_small): source x order (src / p / p x m / lowest m) x floor (0 / .56 / .58 / .60 / .62) x side x multiplier cap
(99 / 1.85 / 1.78) x skip (0 / 1) x slips a slate (1 / 2 / 3) x size 2-6.
REPORT per size: rules positive in BOTH history seasons (>= 75 slips each), ranked by BALANCE (2-season P/L / worst drawdown) - with
skip 0 first (owner: no skipping unless nothing holds) - each with this season's real Pick'Em result; then the ones also positive
this season (>= 3 slips). The live rule F_T1_2max (UD-T1, order p, floor .56, mcap 1.85, skip 1, 2-pick) shown as the reference.
Env: DATABASE_URL, FT_PART (ud | pp), FT_TOP (20).
"""
import datetime as dt
import math
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ST_APP"] = "fliff"
import research_sleeper_transfer as ST              # noqa: E402
import research_sleeper_small as RSS                # noqa: E402

ST.OVR_F = 1.0971
PART = os.environ.get("FT_PART") or "ud"


class PickemPricer:
    """Fliff's real Pick'Em board (latest capture of the slate): its line and multiplier per (player, stat, side)"""
    def __init__(self, conn, d):
        import fliff_live_slip_engine as FL
        fl, _last, _n = FL.board(conn, d)
        self.fl = fl or {}
        self.bx = ST.box(conn, d)

    def leg(self, src):
        pid = str(src["player_id"]) if src.get("player_id") is not None else None
        x = self.fl.get((pid, src["prop"], src["side"]))
        if x is None:
            return None
        nm, line, m, g, match, tip = x
        b = self.bx.get(pid)
        return {"pid": pid, "prop": src["prop"], "side": src["side"], "line": float(line), "m": float(m), "pf": None,
                "hit": ST.grade(self.bx, pid, src["prop"], src["side"], float(line)), "team": b["team"] if b else src.get("team_id"),
                "game": src.get("event_id") or g, "p": float(src["p"]), "same_line": float(src["line"]) == float(line)}


class Book(RSS.SmallBook):
    def report_ft(self):
        top = int(os.environ.get("FT_TOP") or 20)
        rows = []
        for key, v in self.slips.items():
            seas = {}
            for s in ("2024-25", "2025-26", "2026-27"):
                b = [x for x in v if x[0] == s]
                if not b:
                    seas[s] = (0, 0.0, 0.0, 0.0, 0.0)
                    continue
                byday = defaultdict(float)
                for x in b:
                    byday[x[1]] += x[2] - 1
                c = np.cumsum([byday[d] for d in sorted(byday)])
                dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
                pays = np.array([x[2] for x in b])
                seas[s] = (len(b), 100 * (pays.mean() - 1), float(np.sum(pays - 1)), dd, 100 * float(np.mean(pays > 1)))
            rows.append((key, seas))

        def fmt(key, seas):
            src, how, fl, side, mc, sk, ns, k, st = key
            pl = seas["2024-25"][2] + seas["2025-26"][2]; dd = max(seas["2024-25"][3], seas["2025-26"][3])
            return (f"{src:<6} {k}p max order={how:<3} p>={fl:.2f} side={side:<5} m<={mc:<4g} skip={sk} slips/slate={ns} | " +
                    " | ".join(f"{s} {n} {r:+.1f}% (P/L {p:+.1f}u, dd {d:.1f}u, cashed {c:.0f}%)" for s, (n, r, p, d, c) in seas.items()) +
                    f" | 2 seasons P/L {pl:+.1f}u, worst dd {dd:.1f}u, balance {pl / dd if dd else 0:.1f}")

        def bal(r):
            s = r[1]
            dd = max(s["2024-25"][3], s["2025-26"][3])
            return (s["2024-25"][2] + s["2025-26"][2]) / max(dd, 1.0)

        print("=" * 170 + f"\nFLIFF PICK'EM TRANSFER | part {PART} | K_F {ST.OVR_F} | rules {len(rows)}")
        ref = [r for r in rows if r[0] == ("UD-T1", "p", 0.56, "any", 1.85, 1, 1, 2, "max")]
        for r in ref:
            print("  LIVE RULE F_T1_2max: " + fmt(*r))
        for k in ST.KS:
            pool = [r for r in rows if r[0][7] == k and all(r[1][s][0] >= 75 and r[1][s][1] > 0 for s in ("2024-25", "2025-26"))]
            print(f"\n== {k}-pick MAX: {len(pool)} rules positive in both history seasons (>= 75 slips each)")
            for sk in (0, 1):
                ps = sorted([r for r in pool if r[0][5] == sk], key=lambda r: -bal(r))
                print(f"  skip={sk}: top {top} by balance")
                seen = set()
                n = 0
                for r in ps:
                    sig = (round(r[1]["2024-25"][1], 1), round(r[1]["2025-26"][1], 1))
                    if sig in seen:
                        continue
                    seen.add(sig); n += 1
                    print("    " + fmt(*r))
                    if n >= top:
                        break
            live = sorted([r for r in pool if r[1]["2026-27"][0] >= 3 and r[1]["2026-27"][1] > 0], key=lambda r: -bal(r))
            print(f"  ALSO POSITIVE THIS SEASON (>= 3 real Pick'Em slips): {len(live)} rules; top {top} by balance (skip 0 first)")
            for r in sorted(live, key=lambda r: (r[0][5], -bal(r)))[:top]:
                print("    " + fmt(*r))


def main():
    conn = ST.connect()
    bk = Book()
    ST.log(f"fliff transfer part {PART}, K_F {ST.OVR_F}")
    today = dt.datetime.now(ST.AF.UDL.PT).date()
    cur = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) == "2026-27" and dt.date(2026, 10, 20) <= d < today]
    # this season: Fliff's SPORTSBOOK main lines and prices (board_snapshots 'fliff', the feed Pick'Em copies; margin 9.0% vs 9.7%)
    # before the Pick'Em board was captured (10-20..10-25), the real Pick'Em board from 10-26
    early = [d for d in cur if d < dt.date(2026, 10, 26)]
    pick = [d for d in cur if d >= dt.date(2026, 10, 26)]
    if PART == "ud":
        days = [d for d in ST.AF.slate_days(conn) if ST.AF.season_of(d) != "2026-27"]
        conn = ST.run_ud(conn, days, ST.HistPricer, bk)
        conn = ST.run_ud(conn, early, ST.LiveFliffPricer, bk)
        conn = ST.run_ud(conn, pick, PickemPricer, bk)
    else:
        conn = ST.run_pp_hist(conn, bk)
        ST.run_pp_live(conn, early, bk, ST.LiveFliffPricer)
        ST.run_pp_live(conn, pick, bk, PickemPricer)
    bk.report_ft()
    ST.log("done")


if __name__ == "__main__":
    main()
