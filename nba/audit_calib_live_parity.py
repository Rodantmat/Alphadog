#!/usr/bin/env python3
"""
AUDIT - THE CALIBRATED UNIT LIVE = RESEARCH (2026-10-23; before 'C_r70_3power' goes into the production portfolio). READ-ONLY.
For each slate in CP_DATES the live engine's own path (live_slip_engine.load_board_legs_live -> the '__calib__' pool exactly as pick()
builds it -> calib_slips.unit_slips) and the research path (nba_score.tier_map_legs rank 'final_hp' joined to prop_universe - the legs
research_pp_calibrated_slips / research_pp_calib_portfolio measured) build the unit's first CP_K slips. Reported per slate: legs in
each pool (standard lines, final_hp >= the unit's floor), the slips each path builds, and whether they are the same legs.
Env: DATABASE_URL, CP_DATES (comma list), CP_UNITS (default C_r70_3power), CP_K (3).
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calib_slips as CS              # noqa: E402
import live_slip_engine as L          # noqa: E402
import research_pp_calibrated_slips as RC   # noqa: E402

K = int(os.environ.get("CP_K") or 3)


def sig(slip):
    return tuple(sorted((RC_norm(l["player"]), l["prop"], l["side"], round(float(l["line"]), 1)) for l in slip))


def RC_norm(x):
    import research_pp_flex234 as F
    return F.norm(x)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    units = [u for u in (os.environ.get("CP_UNITS") or "P_cal_r70_3power").split(",") if u]
    same = total = 0
    for day in [d for d in (os.environ.get("CP_DATES") or "").split(",") if d]:
        live = L.load_board_legs_live(conn, day)
        lpool = [dict(l, p=float(l['score']), cell=f"{l['prop']}_{l['tier']}") for l in live
                 if l['rank_key'] == 'final_hp' and not l.get('whole_number') and l.get('score') is not None]
        rpool = []
        for s, d, pl, pr, t, sd, ln, f, h, p, tm, ev in conn.execute(RC.LEG_SQL + " AND l.game_date = %s", (list(RC.SEASONS) + ["2026-27"], day)):
            rpool.append({"player": pl, "prop": pr, "tier": t, "side": sd, "line": ln, "factor": f, "hit": h, "p": p, "team_id": tm,
                          "event_id": ev, "cell": f"{pr}_{t}"})
        print(f"\n{day}: live pool {len(lpool):,} legs, research pool {len(rpool):,} legs", flush=True)
        for u in units:
            comp, size, structure, _fam = L.PORTFOLIO_UNITS[u]
            pool_, rank, minp, gc = CS.parse(comp)
            nl = sum(1 for l in lpool if l["tier"] in CS.POOLS[pool_] and l["p"] >= minp)
            nr = sum(1 for l in rpool if l["tier"] in CS.POOLS[pool_] and l["p"] is not None and l["p"] >= minp)
            ls = CS.unit_slips(lpool, comp, size, K)
            rs = CS.unit_slips(rpool, comp, size, K) if rpool else []
            print(f"  {u} ({comp} {size}-{structure}): eligible legs live {nl}, research {nr}")
            for i in range(max(len(ls), len(rs))):
                a = ls[i] if i < len(ls) else None
                b = rs[i] if i < len(rs) else None
                eq = a is not None and b is not None and sig(a) == sig(b)
                if rpool:
                    total += 1; same += int(eq)
                fmt = lambda s: "; ".join(f"{l['player']} {l['prop']} {l['side']} {float(l['line']):g} p{l['p']:.3f}" for l in s) if s else "-"   # noqa: E731
                print(f"    k{i + 1} {'SAME' if eq else ('LIVE ONLY' if not rpool else 'DIFF')}\n      live:     {fmt(a)}\n      research: {fmt(b)}")
    print(f"\nslips identical live vs research: {same} of {total}")


if __name__ == "__main__":
    main()
