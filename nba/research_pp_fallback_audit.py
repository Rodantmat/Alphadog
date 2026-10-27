#!/usr/bin/env python3
"""
AUDIT - THE THIN-NIGHT FALLBACK, DAY BY DAY, WITH THE ENGINE'S OWN CODE (2026-10-27; owner 15:47 PT "Review the fallback strategy is
live for the day by day as well"). READ-ONLY.
  1 PARITY ON HISTORY: live_slip_engine.fallback_slips (what P3 runs) on the research legs of all 309 history slates must reproduce
    research_pp_fallback_rule's numbers (trigger B <= 1: 178 slips, +61.8%, +110u, max drawdown 10u).
  2 THIS SEASON, NIGHT BY NIGHT: every 2026-27 slate's window board exactly as pick() prepares it (load_board_legs -> calibrated
    pool -> portfolio_b.prepare with pb_rates) -> B units built, fallback triggered or not, the slips it builds, graded on the box
    score when the night is final; and what nba_score.live_slips holds for P_FB_U3power that night.
  3 CONFIG + WIRING: classification_config pp_fallback as P3 will read it.
Env: DATABASE_URL, FA_DAY (today PT).
"""
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import research_pp_2pick as R2                       # noqa: E402
import live_slip_engine as L                         # noqa: E402

HIST = list(PC.HIST)


def main():
    today = dt.date.fromisoformat(os.environ.get("FA_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    fb = L.fallback_cfg(conn)
    print(f"3 CONFIG pp_fallback: {fb}")
    if not fb.get("enabled"):
        print("::warning::pp_fallback is NOT enabled")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()

    # 1 parity on history
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=R2.key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    per = {s: [] for s in HIST}
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        prep = PB.prepare(legs, tr.rates())
        tr.push(legs)
        built, sl = L.fallback_slips(prep, fb)
        if built <= int(fb.get("trigger", 1)):
            per[k[0]].append([PC.grade(s, "power") for s in sl])
    print("\n1 PARITY ON HISTORY (engine function on the research legs)")
    allx, allpl = [], []
    for s in HIST:
        x = [m - 1 for d in per[s] for m in d]
        pl = np.array([sum(m - 1 for m in d) for d in per[s]])
        c = np.cumsum(pl)
        dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0
        allx += x; allpl += list(pl)
        print(f"   {s}: {len(per[s])} trigger nights, {len(x)} slips, ROI {100 * np.mean(x):+.1f}%, profit {sum(x):+.1f}u, max dd {dd:.1f}u, "
              f"slips won {100 * np.mean(np.array(x) > 0):.0f}%")
    c = np.cumsum(allpl)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
    print(f"   BOTH: {len(allx)} slips, ROI {100 * np.mean(allx):+.1f}%, profit {sum(allx):+.1f}u, max dd {dd:.1f}u "
          f"(research_pp_fallback_rule run 40594721780: 92 + 80 = 172 slips, +110.0u, dd 10.0u) -> "
          f"{'PARITY OK' if len(allx) == 172 and abs(sum(allx) - 110.0) < 0.05 else 'PARITY DIFFERS - check'}")

    # 2 this season night by night
    print("\n2 THIS SEASON, NIGHT BY NIGHT (the engine's own board and function)")
    graded = {d: p for d, p in R2.live_slates(conn, today)}
    s0, _ = L.regular_season_window(conn, today)
    dates = [r[0] for r in conn.execute("SELECT DISTINCT game_date FROM nba_score.final_hp WHERE game_date >= %s AND game_date <= %s ORDER BY 1",
                                        (s0, today)).fetchall()]
    for d in dates:
        legs = L.load_board_legs(conn, d)
        calib = [dict(l, p=float(l["score"]), cell=f"{l['prop']}_{l['tier']}") for l in legs
                 if l["rank_key"] == "final_hp" and not l.get("whole_number") and l.get("score") is not None]
        if not calib:
            print(f"   {d}: no scored window board"); continue
        prep = PB.prepare(calib, L.pb_rates(conn, d))
        built, sl = L.fallback_slips(prep, fb)
        rec = conn.execute("SELECT k, status, legs_json FROM nba_score.live_slips WHERE game_date=%s AND strategy='P_FB_U3power' ORDER BY k", (d,)).fetchall()
        trig = built <= int(fb.get("trigger", 1))
        line = f"   {d}: portfolio B builds {built} -> " + ("FALLBACK TRIGGERED" if trig else "fallback not needed")
        print(line)
        hits = {}
        if d in graded:
            for l in graded[d]:
                hits[(l["player"], l["prop"], l["side"], float(l["line"]))] = l.get("hit")
        for i, s in enumerate(sl, start=1):
            res = [hits.get((l["player"], l["prop"], l["side"], float(l["line"]))) for l in s]
            g = f" -> x{PC.grade([dict(l, hit=h) for l, h in zip(s, res)], 'power'):.2f}" if d in graded else " (not final)"
            print(f"      built slip {i}: " + "; ".join(f"{l['player']} {l['prop']} U{float(l['line']):g} ({100 * l['p']:.0f}%)"
                                                   + ("" if d not in graded else f" [{ {1: 'hit', 0: 'miss'}.get(h, 'void')}]") for l, h in zip(s, res)) + g)
        for k, st, lj in rec:
            print(f"      recorded k{k} [{st}]: " + "; ".join(f"{x['player']} {x['prop']} U{x['line']:g}" for x in lj))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
