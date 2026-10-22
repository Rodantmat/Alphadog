#!/usr/bin/env python3
"""
RESEARCH - TODAY'S 2-SLIP PORTFOLIO WITHOUT DEMON LEGS (owner 15:13 PT: best play today, no demons) - from the (2026-10-22 PT, certification of the change ordered at 14:38 PT).
READ-ONLY: builds the day's pools exactly as live_slip_engine.pick() does (load_board_legs, pf20, eligible_legs, the pass-45 leg
filter, the Over minutes floor, the family pools) and runs live_slip_engine.portfolio_select with the portfolio ON - prints the
slips the engine WOULD place. Nothing is written. Compare with research_pp_today_slips.py (the research build) for parity.
Env: DATABASE_URL, PD_DAYS (comma list, default today PT), PD_N (2), PD_L (2).
"""
import datetime as dt
import os
import sys
from collections import defaultdict
from zoneinfo import ZoneInfo

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_slip_engine as L   # noqa: E402

ENG = L.ENG


def select_nd(pools, cmap, broad_day, cfg):
    """portfolio_select with every candidate holding a goblin / demon leg passed over (the NONE rule, research_pp_demon_value.py)"""
    cand = {}
    for name in cfg['order']:
        comp, size, structure, fam = L.PORTFOLIO_UNITS[name]
        cand[name] = [s for s in ENG.build_day_slips(pools.get(fam, pools['']), comp, size, structure, 40, cmap, broad_day)
                      if all(l['tier'] == 'R' for l in s)]
    taken, use, seen = [], defaultdict(int), set()
    for k in range(40):
        for name in cfg['order']:
            if len(taken) >= int(cfg['n']) or k >= len(cand[name]):
                continue
            slip = cand[name][k]
            keys = list(dict.fromkeys((l['player'], l['prop'], l['side'], round(float(l['line']), 1)) for l in slip))
            sig = (L.PORTFOLIO_UNITS[name][1], L.PORTFOLIO_UNITS[name][2], tuple(sorted(map(str, keys))))
            if sig in seen or any(use[x] >= int(cfg['leg_cap']) for x in keys):
                continue
            seen.add(sig)
            for x in keys:
                use[x] += 1
            taken.append((name, k + 1, slip))
    return taken


def main():
    days = [dt.date.fromisoformat(x) for x in (os.environ.get("PD_DAYS") or dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()).split(",") if x]
    cfg = dict(L.PORTFOLIO_DEFAULT, enabled=True, n=int(os.environ.get("PD_N") or "2"), leg_cap=int(os.environ.get("PD_L") or "2"))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    for day in days:
        legs = L.load_board_legs(conn, day)
        if not legs:
            print(f"{day}: no scored window board")
            continue
        cmap = ENG.load_corr(conn)
        L.attach_pf20(conn, day, legs)
        pool = ENG.eligible_legs(legs)
        t10 = L.trailing10(conn, day, {l['player_id'] for v in pool.values() for l in v if l['prop'] == 'steals' and l.get('player_id')})
        pool = {c: [l for l in v if L.leg_allowed(l, t10)] for c, v in pool.items()}
        pool = L.over_minutes_filter(conn, day, pool)
        fam_depth = defaultdict(set)
        for c, ls in pool.items():
            for l in ls:
                fam_depth[c.replace('_U', '')].add(l['player'])
        broad_day = sum(1 for v in fam_depth.values() if len(v) >= 2) >= 5
        pools = {'': pool}
        for fam, excl in L.EXCLUDE_BY_FAMILY.items():
            pools[fam] = {c: v for c, v in pool.items() if c not in excl}
        picked = select_nd(pools, cmap, broad_day, cfg)
        print(f"\n{day}: portfolio n {cfg['n']} leg cap {cfg['leg_cap']} -> {len(picked)} slips (broad day {broad_day})")
        for name, k, slip in picked:
            evs = [l.get('event_id') for l in slip]
            fp = 1.0
            for l in slip:
                fp *= float(l['factor'])
            alt = any(abs(float(l['factor']) - 1.0) > 1e-9 for l in slip)
            size, st = L.PORTFOLIO_UNITS[name][1], L.PORTFOLIO_UNITS[name][2]
            sg = len(evs) > len(set(evs))
            print(f"  {name} k{k}: {size}-pick {st} pays {ENG.pp_payout(size, size, st, fp, alt, same_game=sg):.2f}x"
                  + (f" / {ENG.pp_payout(size, size - 1, st, fp, alt, same_game=sg):.2f}x one miss" if st == 'flex' else "")
                  + (" (same game)" if sg else ""))
            for l in slip:
                print(f"     {l['player']:<24} {l['prop']:<12} {'MORE' if l['side'] == 'Over' else 'LESS'} {float(l['line']):>5.1f} {l['tier']:<3} x{float(l['factor']):.2f}")


if __name__ == "__main__":
    main()
