#!/usr/bin/env python3
"""
AUDIT - PORTFOLIO B: LIVE = RESEARCH (2026-10-25, before portfolio B goes on the slip screen; owner 12:47 PT "deploy it"). READ-ONLY.
  1 LOGIC PARITY - every history slate (309): the shared builder portfolio_b (what live runs) vs research_portfolio_caps (what was
    measured), on the same legs in the same fixed order: the six units must build the SAME slip on every slate.
  2 B AS LIVE BUILDS IT on history (fixed tie order, void legs not known in advance): slips a day, ROI per season, max drawdown,
    losing days - the numbers the deployment stands on (research run 40221601395 took the database's row order).
  3 LIVE BOARD PATH - sampled 2025-26 slates: the live engine's own board (live_slip_engine.load_board_legs_live -> the calibrated
    pool exactly as pick() builds it) vs the research legs (tier_map_legs), same trailing window -> the same slips?
  4 TRAILING WINDOW - live_slip_engine.pb_rates (live board graded on the box score + backtest top-up) vs the research window, and
    the window tomorrow's pick will use; then a DRY RUN of today's board (nothing written).
Env: DATABASE_URL, PBA_ONLY=dry (part 4's window + dry run only), PBA_EVERY (sample every n-th 2025-26 slate in part 3, default 6), PBA_DAY (dry-run slate, default today PT).
"""
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
import live_slip_engine as L                         # noqa: E402

IDS = {"B3": 2, "B4": 3, "B5": 4, "B6": 5, "B7": 6, "B9": 8}     # research_portfolio_caps.SPECS index of each unit
EVERY = int(os.environ.get("PBA_EVERY") or 6)


def key(l):
    return (str(l["player"]), l["prop"], l["side"], float(l["line"]), l["tier"])


def nkey(l):
    import research_pp_flex234 as F
    return (F.norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1), l["tier"])


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    if os.environ.get("PBA_ONLY") == "dry":
        return dry_run(conn)
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in PC.HIST], key=lambda k: k[1])
    seas = np.array([k[0] for k in horder])
    for k in horder:
        days[k].sort(key=key)            # the fixed tie order, for both paths
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    C = PC.candidates(days, horder)
    print(f"{len(horder)} history slates", flush=True)

    # ---------------- 1 + 2 ----------------
    tr = PB.Trailing()
    same = defaultdict(int); diff = defaultdict(list); built = defaultdict(int)
    live_res = []
    research_rates = {}
    for di, k in enumerate(horder):
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        rates = tr.rates()
        research_rates[k[1]] = rates
        prep = PB.prepare(legs, rates)
        day = []
        for uid, si in IDS.items():
            cand, gc, pc = C[di][si]
            r = PC.select(cand, gc, pc, PC.SPECS[si][4])
            m = PB.unit_slip(prep, uid, graded_only=True)
            rk = None if r is None else [key(l) for l in r]
            mk = None if m is None else [key(l) for l in m]
            if rk == mk:
                same[uid] += 1
            else:
                diff[uid].append((k[1], rk, mk))
            lv = PB.unit_slip(prep, uid, graded_only=False)
            if lv is not None:
                built[uid] += 1
                day.append((uid, PC.grade(lv, PB.UNITS[uid][3])))
        live_res.append(day)
        tr.push(legs)
    print("\n1 LOGIC PARITY (shared builder vs research, same legs, same order)")
    ok = True
    for uid in IDS:
        print(f"  {uid}: same slip on {same[uid]} of {len(horder)} slates, different on {len(diff[uid])}")
        for d, rk, mk in diff[uid][:3]:
            print(f"     {d}: research {rk}\n           builder  {mk}")
        ok &= not diff[uid]
    print(f"  LOGIC PARITY {'CERTIFIED - identical on every slate' if ok else 'FAILED'}")
    print("\n2 B AS LIVE BUILDS IT (fixed tie order, void legs unknown in advance), flat 1u a slip")
    print("  " + PC.fmt(PC.flat_metrics([[(list(IDS).index(u), m) for u, m in d] for d in live_res], seas)))
    for uid in IDS:
        x = [m - 1 for d in live_res for u, m in d if u == uid]
        print(f"   {uid}: {len(x)} slips, ROI {100 * np.mean(x):+.0f}%")

    # ---------------- 3 ----------------
    print("\n3 LIVE BOARD PATH vs RESEARCH LEGS (sampled 2025-26 slates, same trailing window)")
    tot = agree = 0
    s26 = [k for k in horder if k[0] == "2025-26"][::EVERY]
    for k in s26:
        d = k[1]
        live = L.load_board_legs_live(conn, d)
        lpool = [dict(l, p=float(l['score']), cell=f"{l['prop']}_{l['tier']}") for l in live
                 if l['rank_key'] == 'final_hp' and not l.get('whole_number') and l.get('score') is not None]
        if not lpool:
            print(f"  {d}: no live window board - skipped")
            continue
        lp = PB.prepare(lpool, research_rates[d])
        rp = PB.prepare([l for l in days[k] if l["p"] is not None and l["team_id"] is not None], research_rates[d])
        line = []
        for uid in IDS:
            a, b = PB.unit_slip(lp, uid), PB.unit_slip(rp, uid)
            sa = None if a is None else sorted(nkey(l) for l in a)
            sb = None if b is None else sorted(nkey(l) for l in b)
            tot += 1; agree += sa == sb
            line.append(f"{uid} {'SAME' if sa == sb else 'DIFF'}")
            if sa != sb:
                print(f"    {d} {uid} live:     {sa}\n    {d} {uid} research: {sb}")
        lv_lv = sum(1 for l in lp if l['tier'] == 'R' and PB.GRP.get(l['prop']) == 'lowvol')
        rs_lv = sum(1 for l in rp if l['tier'] == 'R' and PB.GRP.get(l['prop']) == 'lowvol')
        print(f"  {d}: calibrated legs live {len(lp)} / research {len(rp)}, low-volume standard {lv_lv} / {rs_lv} | " + ", ".join(line), flush=True)
    print(f"  LIVE BOARD PATH: {agree} of {tot} unit-slates build the same slip")

    # ---------------- 4 ----------------
    print("\n4 TRAILING WINDOW: live pb_rates vs research window (low-volume standard cells, hit rate)")
    for k in s26[:6]:
        d = k[1]
        lr = L.pb_rates(conn, d)
        rr = research_rates[d]
        cells = sorted(c for c in rr if c[1] == "R" and PB.GRP.get(c[0]) == "lowvol")
        print(f"  {d}: " + "; ".join(f"{c[0]} {c[2]} live {lr.get(c, (0, 0))[0]}/{lr.get(c, (0, 0))[1]} "
                                    f"({100 * lr[c][0] / max(lr[c][1], 1):.0f}%) vs research {rr[c][0]}/{rr[c][1]} ({100 * rr[c][0] / max(rr[c][1], 1):.0f}%)"
                                    for c in cells if c in lr))
    dry_run(conn)


def dry_run(conn):
    today = dt.date.fromisoformat(os.environ.get("PBA_DAY") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat())
    for d in (today, today + dt.timedelta(days=1)):
        print(f"\n  window for {d}:")
        L.pb_rates(conn, d)
    print(f"\n  DRY RUN on {today}'s board (nothing written):")
    live = L.load_board_legs_live(conn, today)
    lpool = [dict(l, p=float(l['score']), cell=f"{l['prop']}_{l['tier']}") for l in live
             if l['rank_key'] == 'final_hp' and not l.get('whole_number') and l.get('score') is not None]
    prep = PB.prepare(lpool, L.pb_rates(conn, today))
    for uid in IDS:
        s = PB.unit_slip(prep, uid)
        print(f"    {uid} {PB.UNITS[uid][2]}-pick {PB.UNITS[uid][3]}: " + ("no slip today" if s is None else "; ".join(
            f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} [{l['tier']}] p{l['p']:.3f}" for l in s)))
    print("done", flush=True)


if __name__ == "__main__":
    main()
