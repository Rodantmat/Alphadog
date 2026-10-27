#!/usr/bin/env python3
"""
RESEARCH - PARITY DIFF: the engine's fallback_slips vs research_pp_fallback_rule.build, night by night on the certified history
(2026-10-27; the audit showed 172 vs 178 slips at the same +110u). READ-ONLY. Prints every night where the two differ, with the
legs and the grades. Env: DATABASE_URL.
"""
import json
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portfolio_b as PB                             # noqa: E402
import research_portfolio_caps as PC                 # noqa: E402
import research_pp_2pick as R2                       # noqa: E402
import research_pp_fallback as F                     # noqa: E402
import research_pp_fallback_rule as FR               # noqa: E402
import live_slip_engine as L                         # noqa: E402

HIST = list(PC.HIST)


def lab(s):
    return " + ".join(f"{l['player']} {l['prop']} U{float(l['line']):g} p{float(l['p']):.3f} ev{l.get('event_id')} t{l.get('team_id')} "
                      f"h{l.get('hit')}" for l in s)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    fb = conn.execute("SELECT config_json FROM nba_config.classification_config WHERE config_key='pp_fallback'").fetchone()[0]
    fb = fb if isinstance(fb, dict) else json.loads(fb)
    PC.SE.flex_alt_tiers(); PC.SE.payout_v3_rules()
    days = PC.L1.RC.load(conn)
    days = {k: [l for l in v if l["prop"] in PC.L1.CAL_PROPS] for k, v in days.items()}
    horder = sorted([k for k in days if k[0] in HIST], key=lambda k: k[1])
    for k in horder:
        days[k].sort(key=R2.key)
    PC.L3.attach_ranks(conn, days)
    PC.MX.leg_features(conn, days, horder)
    tr = PB.Trailing()
    tot = {"eng": [0, 0.0], "res": [0, 0.0]}
    ndiff = 0
    for k in horder:
        legs = [l for l in days[k] if l["p"] is not None and l["team_id"] is not None]
        prep = PB.prepare(legs, tr.rates())
        tr.push(legs)
        bc = F.b_count(prep)
        built, eng = L.fallback_slips(prep, fb)
        res = FR.build(prep, 0.55, 2) if bc <= 1 else []
        for tag, sl in (("eng", eng), ("res", res)):
            tot[tag][0] += len(sl); tot[tag][1] += sum(PC.grade(s, "power") - 1 for s in sl)
        if built != bc or [[id(l) for l in s] for s in eng] != [[id(l) for l in s] for s in res]:
            ndiff += 1
            print(f"DIFF {k[0]} {k[1]}: B engine {built} / research {bc}")
            for i, s in enumerate(eng, 1):
                print(f"   engine   {i}: {lab(s)} -> x{PC.grade(s, 'power'):.2f}")
            for i, s in enumerate(res, 1):
                print(f"   research {i}: {lab(s)} -> x{PC.grade(s, 'power'):.2f}")
    print(f"\nTOTAL engine {tot['eng'][0]} slips {tot['eng'][1]:+.1f}u | research {tot['res'][0]} slips {tot['res'][1]:+.1f}u | "
          f"{ndiff} nights differ")
    print("done", flush=True)


if __name__ == "__main__":
    main()
