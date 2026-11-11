#!/usr/bin/env python3
"""RESEARCH (2026-11-10, owner 23:41 PT: "extra pp fallbacks when low slips are formed, safer strategies"). READ-ONLY.
The live thin-night fallback (P_FB_U3power: 3-pick Power of the best standard Unders, final_hp >= .55, 2 slips) fires only when
portfolio B builds <= 1 slip. Question: on nights B builds only 2, 3 or 4 slips, which EXTRA slips are safe (positive both seasons AND this
season, low drawdown, high cash rate)? Same legs / grading / B count as research_pp_fallback_rule (parity-certified).
Rules are ADDED on top of whatever B built (they do not replace). Per trigger T (B built <= T), per rule, per season + this season:
nights, slips, ROI, profit, slips won, max drawdown (night by night), worst night, longest losing run (nights).
Env: DATABASE_URL, FR_DAY."""
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
# name: (side, floor, size, structure, slips)
RULES = {
    "U3 power .55 x2 (LIVE fallback)": ("Under", 0.55, 3, "power", 2),
    "U3 power .58 x2": ("Under", 0.58, 3, "power", 2),
    "U3 power .55 x1": ("Under", 0.55, 3, "power", 1),
    "U3 flex  .55 x2": ("Under", 0.55, 3, "flex", 2),
    "U3 flex  .58 x2": ("Under", 0.58, 3, "flex", 2),
    "U4 flex  .55 x2": ("Under", 0.55, 4, "flex", 2),
    "U4 flex  .58 x2": ("Under", 0.58, 4, "flex", 2),
    "U4 flex  .60 x2": ("Under", 0.60, 4, "flex", 2),
    "U5 flex  .55 x2": ("Under", 0.55, 5, "flex", 2),
    "U6 flex  .55 x1": ("Under", 0.55, 6, "flex", 1),
    "U2 power .62 x2": ("Under", 0.62, 2, "power", 2),
    "U2 power .66 x2": ("Under", 0.66, 2, "power", 2),
    "BOTH 3 power .60 x2": ("Both", 0.60, 3, "power", 2),
    "BOTH 3 flex  .58 x2": ("Both", 0.58, 3, "flex", 2),
    "BOTH 4 flex  .58 x2": ("Both", 0.58, 4, "flex", 2),
}


def build(prep, rule):
    side, floor, size, st, ns = rule
    c = sorted([l for l in prep if l["tier"] == "R" and (side == "Both" or l["side"] == side) and l["p"] >= floor], key=lambda l: -l["p"])
    out, banned = [], set()
    for _ in range(ns):
        s = F.sel(c, 1, size, banned)
        if not s:
            break
        out.append(s)
        banned |= {l["player"] for l in s}
    return out


def report(label, nights):
    pl = np.array([sum(m - 1 for m in d) for d in nights])
    slips = [m - 1 for d in nights for m in d]
    act = [p for d, p in zip(nights, pl) if d]
    if not slips:
        return f"   {label}: {len(nights)} nights, no slip built"
    c = np.cumsum([p for p in pl])
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c)) if len(c) else 0
    streak = best = 0
    for p in act:
        streak = streak + 1 if p < 0 else 0
        best = max(best, streak)
    return (f"   {label}: {len(nights):3d} nights {len(slips):3d} slips | ROI {100 * np.mean(slips):+6.1f}% | profit {sum(slips):+7.1f}u | dd {dd:5.1f}u | "
            f"won {100 * np.mean(np.array(slips) > 0):3.0f}% | nights lost {100 * np.mean(np.array(act) < 0):3.0f}% | worst night {min(act):+5.1f}u | losing run {best}")


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
    print("B slips-built distribution per season (nights):")
    for s in HIST + [CUR]:
        ds = [b for (ss, _d, _p), b in zip(slates, bc) if ss == s]
        print(f"   {s}: {len(ds)} nights; built 0:{ds.count(0)} 1:{ds.count(1)} 2:{ds.count(2)} 3:{ds.count(3)} 4:{ds.count(4)} 5+:{sum(1 for x in ds if x >= 5)}")
    for T in (1, 2, 3, 4):
        print("\n" + "=" * 190)
        print(f"TRIGGER: portfolio B built <= {T} slips -> ADD the rule's slips (1u each)")
        for name, rule in RULES.items():
            print(f"  {name}")
            for s in HIST + [CUR, "ALL"]:
                nights = []
                for (ss, d, prep), b in zip(slates, bc):
                    if b > T or (s != "ALL" and ss != s):
                        continue
                    nights.append([PC.grade(x, rule[3]) for x in build(prep, rule)])
                print(report(s, nights))
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
