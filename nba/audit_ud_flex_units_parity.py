#!/usr/bin/env python3
"""AUDIT (2026-11-11): the DEPLOYED Underdog Flex builder (ud_portfolio_c.flex_slips, units C3-C6) against the research selection
(research_deploy_proof_ud.CANDS / slips_from) on the same calibrated legs: every slate, every unit, identical legs or it prints the
difference. Also grades the deployed slips (this season real prices; history repriced to today's law, every 4th slate) and prints
slips / ROI so the proof numbers are reproduced by the deployed code. READ-ONLY. Env: DATABASE_URL."""
import os
import sys
from collections import defaultdict

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("APP", "UD")
import build_ud_slip_engine as E                     # noqa: E402
import research_app_final_strategies as AF           # noqa: E402
import research_deploy_proof_ud as P                 # noqa: E402
import ud_portfolio_c as C                           # noqa: E402

MAP = {"C3": "4F R both nolow ph skip2 (C3)", "C4": "3F R Less all rh>=.535", "C5": "4F RB Less lowvol score fp>=.55", "C6": "6F R Less all base fp>=.00"}


def key(slip):
    return tuple(sorted((l["player"], l["prop"], l["side"], float(l["line"])) for l in slip))


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    days = AF.slate_days(conn)
    by = defaultdict(list)
    for d in days:
        by[AF.season_of(d)].append(d)
    use = []
    for s in P.SEASONS:
        ds = sorted(by.get(s, []))
        if s != "2026-27":
            ds = ds[:-7][::4]
        use += [(s, d) for d in ds]
    diff = n_cmp = 0
    agg = {u: defaultdict(list) for u in MAP}
    for s, d in use:
        st = AF.box(conn, d)
        if not st:
            continue
        legs, _rows = AF.load_ud(conn, d, st)
        legs = [l for l in legs if l.get("hit") is not None]
        legs.sort(key=lambda l: (str(l["player"]), l["prop"], l["side"], l["line"]))
        fair = C.consensus(conn, d)
        hist = s != "2026-27"
        if hist:
            keep = []
            for l in legs:
                l["lv"] = C.lvl(l["tier"])
                if l["lv"] is None:
                    continue
                nv, _src = C.nv_of(fair, l, fill=False)
                if nv is None:
                    continue
                l["m"] = round(C.K.get((l["lv"], l["side"]), C.K_ALL) / nv, 2)
                keep.append(l)
            legs = keep
        cl = C.calibrate(legs, fair, P.COEF[s], fill=not hist)
        for uid, name in MAP.items():
            lv, sd, pr, rk, fk, fl, sk, size, stt, ns = P.CANDS[name]
            pool = [l for l in cl if l["lv"] in P.LEVELS[lv] and l["side"] in P.SIDES[sd] and (P.PROPS[pr] is None or l["g"] in P.PROPS[pr])]
            srt = sorted(pool, key=lambda l: -(l[rk] if l.get(rk) is not None else -1))
            base = [l for l in srt if (l.get(fk) if l.get(fk) is not None else -1) >= fl][sk:]
            ref = [key(x) for x in P.slips_from(base, size, ns)]
            dep_slips = C.flex_slips(uid, cl)
            dep = [key(x) for x in dep_slips]
            n_cmp += 1
            if ref != dep:
                diff += 1
                print(f"DIFF {s} {d} {uid}: research {ref} deployed {dep}", flush=True)
            agg[uid][s].extend(P.pay(x, "flex") - 1 for x in dep_slips)
    print(f"\nparity: {n_cmp} unit-slates compared, {diff} differ")
    for uid in MAP:
        for s in P.SEASONS:
            r = agg[uid][s]
            if r:
                print(f"  {uid} {s}: {len(r)} slips ROI {100 * sum(r) / len(r):+.1f}% profit {sum(r):+.1f}u")
    print("PARITY " + ("PASS" if diff == 0 else "FAIL"), flush=True)


if __name__ == "__main__":
    main()
