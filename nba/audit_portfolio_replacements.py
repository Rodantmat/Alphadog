#!/usr/bin/env python3
"""
AUDIT - TODAY'S PORTFOLIO SLIPS AFTER A TIP (2026-10-23; owner 14:22 PT: "take a look on the slips it built and be sure that I can
place those slips"). READ-ONLY: nothing is written.

The live pick runs before the slate's FIRST tip, but a leg whose own game has started can no longer be entered on PrizePicks. This
rebuilds the day's 2-slip portfolio round robin exactly as live_slip_engine.pick() does (same board loader, leg filter, Over minutes
floor, family pools, calibrated pool, portfolio_select with the configured order / leg cap), lists the first 16 slips of the round
robin with every leg's game tip time, and marks each slip PLACEABLE NOW (no leg's game has tipped) or LOCKED. It then walks the round
robin again keeping only placeable slips (same no-repeat and leg-cap rules) to show which two slips the portfolio rule gives when
the started games are taken out.
Env: DATABASE_URL, AP_DATE (default today PT).
"""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slip_engine as ENG      # noqa: E402
import live_slip_engine as LS        # noqa: E402

PT = ZoneInfo("America/Los_Angeles")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    day = dt.date.fromisoformat(os.environ["AP_DATE"]) if os.environ.get("AP_DATE") else dt.datetime.now(PT).date()
    now = dt.datetime.now(dt.timezone.utc)
    tips = {}
    for ev, ct in conn.execute("""SELECT event_id, max(commence_time) FROM nba_market.board_snapshots WHERE bookmaker='prizepicks'
                                  AND game_date=%s AND event_id IS NOT NULL GROUP BY 1""", (day,)):
        if isinstance(ct, str):
            ct = dt.datetime.fromisoformat(ct.replace("Z", "+00:00"))
        tips[ev] = ct
    legs = LS.load_board_legs(conn, day)
    cmap = ENG.load_corr(conn)
    LS.attach_pf20(conn, day, legs)
    pool = ENG.eligible_legs(legs)
    t10 = LS.trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
    pool = {c: [l for l in v if LS.leg_allowed(l, t10)] for c, v in pool.items()}
    pool = LS.over_minutes_filter(conn, day, pool)
    fam_depth = defaultdict(set)
    for c, lg in pool.items():
        for l in lg:
            fam_depth[c.replace('_U', '')].add(l['player'])
    broad_day = sum(1 for v in fam_depth.values() if len(v) >= 2) >= 5
    pools = {'': pool}
    for fam, excl in LS.EXCLUDE_BY_FAMILY.items():
        pools[fam] = {c: v for c, v in pool.items() if c not in excl}
    pools['__calib__'] = [dict(l, p=float(l['score']), cell=f"{l['prop']}_{l['tier']}") for l in legs
                          if l['rank_key'] == 'final_hp' and not l.get('whole_number') and l.get('score') is not None]
    pf = LS.portfolio_cfg(conn)
    print(f"{day}: now {now.astimezone(PT):%H:%M} PT; portfolio order {pf['order']}, n {pf['n']}, leg cap {pf['leg_cap']}")
    allc = LS.portfolio_select(pools, cmap, broad_day, dict(pf, n=0), extra=16)

    def tip_of(l):
        return tips.get(l.get('event_id'))
    print("\nROUND ROBIN (first 16, as the engine builds them):")
    for name, k, slip in allc:
        locked = [l for l in slip if tip_of(l) and tip_of(l) <= now]
        print(f"  {name} k{k}: {'LOCKED (' + ', '.join(l['player'] for l in locked) + ' already tipped)' if locked else 'PLACEABLE NOW'}")
        for l in slip:
            t = tip_of(l)
            print(f"      {l['player']:<24} {l['prop']:<12} {l['side']:<5} {float(l['line']):>5g} {l['tier']:<3} x{float(l['factor']):.3f}  "
                  f"tip {t.astimezone(PT):%H:%M} PT" if t else "tip ?")
    # the portfolio rule again, placeable slips only
    lcap, n = int(pf['leg_cap']), int(pf['n'])
    use, seen, taken = defaultdict(int), set(), []
    for name, k, slip in allc:
        if any(tip_of(l) and tip_of(l) <= now for l in slip):
            continue
        keys = list(dict.fromkeys((l['player'], l['prop'], l['side'], round(float(l['line']), 1)) for l in slip))
        if any(use[x] >= lcap for x in keys):
            continue
        for x in keys:
            use[x] += 1
        taken.append((name, k, slip))
        if len(taken) >= n:
            break
    print("\nPLACEABLE PORTFOLIO NOW (same round robin, started games out):")
    for name, k, slip in taken:
        print(f"  {name} k{k}: " + "; ".join(f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} ({l['tier']})" for l in slip))


if __name__ == "__main__":
    main()
