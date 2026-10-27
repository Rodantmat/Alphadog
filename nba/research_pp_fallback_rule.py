#!/usr/bin/env python3
"""
RESEARCH - THE CANDIDATE PRIZEPICKS FALLBACK, MEASURED ONLY ON THE NIGHTS IT IS NEEDED (2026-10-27; owner 15:24 PT "How the live
fallback holds ROI, profit, drawdown, losing / winning percentages on the past seasons and the current season? Only on day it was
needed"). READ-ONLY.

RULE (research_pp_fallback run 40592769073, the one rule chosen on 2024-25 that held on 2025-26): standard lines, any prop, UNDER only,
ranked by final_hp, final_hp >= 0.55, no skip, <= 1 leg a game, 3-pick POWER, 2 slips a night (second from other players), 1 unit
each. TRIGGER: portfolio B built <= T slips that night (T = 1 and 2). Legs, grading and pay exactly as research_pp_fallback.
Per season and this season: nights triggered, nights with a slip, slips, ROI, profit (units), max drawdown (units, night by night),
slips won, winning / losing / flat nights, worst night, longest losing streak (nights); plus the same with the neighbouring floors
(.52 / .58) and 1 slip a night. Env: DATABASE_URL, FR_DAY (today PT).
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
import research_pp_fallback as F                     # noqa: E402

HIST = list(PC.HIST)
CUR = "2026-27"


def build(prep, floor, nslips, size=3):
    c = sorted([l for l in prep if l["tier"] == "R" and l["side"] == "Under" and l["p"] >= floor], key=lambda l: -l["p"])
    s1 = F.sel(c, 1, size, set())
    out = [s1] if s1 else []
    if s1 and nslips > 1:
        s2 = F.sel(c, 1, size, {l["player"] for l in s1})
        if s2:
            out.append(s2)
    return out


def report(label, nights):
    """nights: list of per-night lists of multipliers (empty = triggered, no slip)"""
    pl = np.array([sum(m - 1 for m in d) for d in nights])
    slips = [m - 1 for d in nights for m in d]
    act = [p for d, p in zip(nights, pl) if d]
    if not slips:
        return f"   {label}: {len(nights)} nights triggered, no slip built"
    c = np.cumsum(pl)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0
    streak = best = 0
    for p in act:
        streak = streak + 1 if p < 0 else 0
        best = max(best, streak)
    return (f"   {label}: {len(nights)} nights triggered, {len(act)} with a slip, {len(slips)} slips | ROI {100 * np.mean(slips):+.1f}% | "
            f"profit {sum(slips):+.1f}u | max drawdown {dd:.1f}u | slips won {100 * np.mean(np.array(slips) > 0):.0f}% | nights won "
            f"{100 * np.mean(np.array(act) > 0):.0f}% / lost {100 * np.mean(np.array(act) < 0):.0f}% / flat {100 * np.mean(np.array(act) == 0):.0f}% | "
            f"worst night {min(act):+.1f}u | longest losing run {best} nights")


def main():
    today = dt.date.fromisoformat(os.environ.get("FR_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=R2.key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    slates = []
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        slates.append((k[0], k[1], PB.prepare(legs, tr.rates())))
        tr.push(legs)
    for d, prep in R2.live_slates(conn, today):
        slates.append((CUR, d, prep))
    bc = [F.b_count(p) for _, _, p in slates]
    for T in (1, 2):
        print(f"\n===== TRIGGER: portfolio B built <= {T} slips =====")
        for floor, ns in ((0.55, 2), (0.52, 2), (0.58, 2), (0.55, 1)):
            tag = f"floor {floor:.2f}, {ns} slip(s) a night" + ("  <- THE CANDIDATE" if (floor, ns) == (0.55, 2) else "")
            print(f"  {tag}")
            for s in HIST + [CUR, "ALL"]:
                nights = []
                for (ss, d, prep), b in zip(slates, bc):
                    if b > T or (s != "ALL" and ss != s):
                        continue
                    nights.append([PC.grade(x, "power") for x in build(prep, floor, ns)])
                print(report(s, nights))
            if (floor, ns) == (0.55, 2):
                print("   night by night, this season:")
                for (ss, d, prep), b in zip(slates, bc):
                    if ss == CUR and b <= T:
                        got = build(prep, floor, ns)
                        print(f"     {d}: B built {b}; " + (" || ".join(
                            " + ".join(f"{l['player']} {l['prop']} U{float(l['line']):g} ({'hit' if l.get('hit') == 1 else 'miss' if l.get('hit') == 0 else 'void'})" for l in x)
                            + f" -> x{PC.grade(x, 'power'):.2f}" for x in got) or "no slip"))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
