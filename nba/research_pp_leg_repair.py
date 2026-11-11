#!/usr/bin/env python3
"""RESEARCH (2026-11-11, owner 14:12 PT: "don't drop all of them ... find which plan keeps more ROI, shrink, sub or whatever"). READ-ONLY.
Portfolio B's unit slips share legs; ONE leg PrizePicks does not list as a standard line (quote gate: 'not on PrizePicks' board as built') drops the
whole slip. For every night and every live unit's slip (B3 B4 B5 B7 B9 U4 J1 J2 J3 F5) take each leg j in turn as the unlisted one and grade:
  base    the slip as built (the leg listed) - the reference
  shrink  the slip without leg j: one pick fewer, same structure (6F -> 5F, 5F -> 4F, 4F -> 3F, 3P -> 2P)
  sub     the unit rebuilt without leg j's player (the next qualified leg takes its place; same caps)
Per unit size and season: slips, ROI per plan, cash rate; 'top' = the unlisted leg is the unit's first leg (the shared one), 'any' = each leg in turn.
Same legs / grading as research_pp_fallback_more (parity-certified). Env: DATABASE_URL, FR_DAY."""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import numpy as np
import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import research_pp_2pick as R2                       # noqa: E402

HIST = list(PC.HIST)
CUR = "2026-27"
UNITS = ("B3", "B4", "B5", "B7", "B9", "U4", "J1", "J2", "J3", "F5")


def grade(pick, st):
    if len(pick) < 2 or len({l["team_id"] for l in pick}) < 2:
        return None
    return PC.grade(pick, st)


def rebuild_without(prep, uid, banned_player):
    c, gc, pc = PB.candidates(prep, uid)
    if uid in PB.BANS:
        b = set()
        for u in PB.BANS[uid]:
            sb = PB.unit_slip(prep, u)
            if sb:
                b |= {l["player"] for l in sb}
        c = [l for l in c if l["player"] not in b]
    c = [l for l in c if l["player"] != banned_player]
    return PB.select(c, gc, pc, PB.UNITS[uid][2])


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
    # res[(size, st, which)][season][plan] -> list of multipliers - 1 ; which = top | any
    res = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for ss, d, prep in slates:
        for uid in UNITS:
            s = PB.unit_slip(prep, uid)
            if not s:
                continue
            _k, _p, size, st = PB.UNITS[uid]
            base = grade(s, st)
            if base is None:
                continue
            for j in range(size):
                which = ("top", "any") if j == 0 else ("any",)
                rest = s[:j] + s[j + 1:]
                sst = st if len(rest) >= 3 or st == "power" else st
                sh = grade(rest, sst) if len(rest) >= 2 else None
                sb_slip = rebuild_without(prep, uid, s[j]["player"])
                sb = grade(sb_slip, st) if sb_slip else None
                for w in which:
                    r = res[(size, st, w)][ss]
                    r["base"].append(base - 1)
                    r["shrink"].append((sh - 1) if sh is not None else None)
                    r["sub"].append((sb - 1) if sb is not None else None)
    print("=" * 200)
    for key in sorted(res):
        size, st, w = key
        print(f"\n{size}-pick {st.upper()} | unlisted leg: {w}")
        for s in HIST + [CUR]:
            r = res[key][s]
            if not r["base"]:
                continue
            line = f"   {s}: {len(r['base']):4d} slips | base ROI {100 * np.mean(r['base']):+6.1f}%"
            for plan in ("shrink", "sub"):
                v = [x for x in r[plan] if x is not None]
                line += f" | {plan}: {len(v):4d} built ROI {100 * np.mean(v):+6.1f}% cash {100 * np.mean(np.array(v) > 0):3.0f}%" if v else f" | {plan}: none"
            print(line)
        for plan in ("base", "shrink", "sub"):
            v = [x for s in HIST + [CUR] for x in res[key][s][plan] if x is not None]
            if v:
                c = np.cumsum(v)
                dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], c]))[1:] - c))
                print(f"   ALL {plan:<6}: {len(v):4d} slips ROI {100 * np.mean(v):+6.1f}% profit {sum(v):+7.1f}u dd {dd:5.1f}u cash {100 * np.mean(np.array(v) > 0):3.0f}%")
    print("\ndone", flush=True)


if __name__ == "__main__":
    main()
