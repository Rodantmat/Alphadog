#!/usr/bin/env python3
"""PARITY (owner 2026-11-07): portfolio_b units J1 J2 J3 F5 (the live builder) vs the research builder (friend_engine.pp_cand + build_at) on every slate. READ-ONLY."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
PB = FE.PB

def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    n = bad = 0
    miss = {u: 0 for u in ("J1", "J2", "J3", "F5")}
    for season, d, legs in FE.pp_days(conn):
        if len(legs) < 3:
            continue
        n += 1
        used = set(); exp = {}
        for u in ("J1", "J2", "J3"):
            kind, rule, size, st = PB.UNITS[u]
            cand, gc = FE.pp_cand(legs, rule)
            s = FE.build_at(cand, size, gc, set(), frozenset(used), True, 0)
            exp[u] = s
            if s: used |= {FE.pid(l) for l in s}
        kind, rule, size, st = PB.UNITS["F5"]
        cand, gc = FE.pp_cand(legs, rule)
        exp["F5"] = FE.build_at(cand, size, gc, set(), frozenset(), True, 0)
        for u in exp:
            got = PB.unit_slip(legs, u)
            a = frozenset(FE.lk(l) for l in exp[u]) if exp[u] else None
            b = frozenset(FE.lk(l) for l in got) if got else None
            if a != b:
                miss[u] += 1; bad += 1
                if bad <= 8: print("MISMATCH", d, u, "research", sorted(a or []), "live", sorted(b or []))
    print(f"{n} slates, mismatches {miss}, total {bad}")
    print("PARITY ALL PASS" if not bad else "PARITY FAILED")
if __name__ == "__main__":
    main()
