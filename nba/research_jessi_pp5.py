#!/usr/bin/env python3
"""
JESSI PRIZEPICKS v5 (owner 2026-11-06 23:01): mix the owner's B4 rule with the Variant-A family. Regular lines only (no demons), 4-pick Flex, low-volume props.
Pairs of slips (both orders, players never repeated), never an exact copy of his / the friend's slip. Reports history per season, this season, losing days, drawdown, drought,
and how many of her legs are also legs of HIS slips of the day (difference from his). READ-ONLY.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ
import research_jessi_pp3 as P3

GRID = list(itertools.product(("R",), ("B", "U", "O"), ("lowvol", "all"), ("trail", "p", "blend", "ev"), (0.58, 0.60, 0.62, 0.64, 0.66), (1, 2), (0, 1, 2), ("all", "low", "high")))
B4 = ("R", "B", "lowvol", "trail", 0.62, 1, 0, "all")


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    DAYS = {}
    for season, d, legs in FE.pp_days(conn):
        if len(legs) < 3:
            continue
        H = FE.proxies(legs)
        his = set()
        for uid in FE.HIS_PP:
            s = FE.PB.unit_slip(legs, uid)
            if s:
                his |= {FE.lk(l) for l in s}
        DAYS[d] = (legs, P3.forbidden(legs, H), his)
    conn.close()
    days = sorted(DAYS)
    cur = [d for d in days if str(d) >= "2026-08-01"]; pre = [d for d in days if str(d) < "2026-08-01"]
    s24 = [d for d in pre if str(d) < "2025-08-01"]; s25 = [d for d in pre if str(d) >= "2025-08-01"]
    print(f"{len(days)} slates; this season {len(cur)}", flush=True)
    VAR = collections.defaultdict(dict)
    cands = [("4F",) + (v,) for v in GRID]
    cands = random.Random(7).sample(GRID, 900) + [B4]
    for d in days:
        legs, fb, his = DAYS[d]
        for v in cands:
            try:
                s = P3.build_distinct(legs, 4, v, fb)
            except Exception:
                s = None
            if s:
                VAR[v].setdefault(d, []).append(RJ.pay(s, "flex") - 1.0)
    seen, sc = set(), []
    for v, ser in VAR.items():
        sig = tuple(sorted((d, round(sum(x), 4)) for d, x in ser.items()))
        if sig in seen:
            continue
        seen.add(sig)
        a, b, c = RJ.stats(ser, s24), RJ.stats(ser, s25), RJ.stats(ser, pre)
        if a and b and c and a["roi"] > 0.3 and b["roi"] > 0.3 and c["days"] >= 0.4 * len(pre):
            sc.append(((1 - c["loss"]) ** 2 * c["roi"] ** 0.5 / (1 + c["dd"] / 10), v))
    sc.sort(reverse=True)
    top = [v for _, v in sc[:40]]
    if B4 not in top:
        top.append(B4)
    print("standalone finalists", len(top), flush=True)

    def jser(rules, dsel):
        out = {}
        for d in dsel:
            legs, fb, his = DAYS[d]
            xs = P3.joint(legs, [(4, "flex", r) for r in rules], fb)
            if xs:
                out[d] = xs
        return out
    res = []
    for a, b in itertools.permutations(top, 2):
        ser = jser([a, b], pre)
        st = RJ.stats(ser, pre)
        s1, s2 = RJ.stats(ser, s24), RJ.stats(ser, s25)
        if not st or not s1 or not s2 or s1["roi"] < 0.4 or s2["roi"] < 0.4 or st["roi"] < 0.55:
            continue
        res.append(((1 - st["loss"]) ** 2 * st["roi"] ** 0.5 / (1 + st["dd"] / 10), a, b))
    res.sort(reverse=True)
    print(f"\npairs passing: {len(res)}")
    shown = []
    for sc_, a, b in res:
        key = (a[:6], b[:6])
        if (b, a) in [(x, y) for x, y in shown]:
            continue
        shown.append((a, b))
        if len(shown) > 6:
            break
    # ensure the pure pair B4 + best other is shown
    for i, (a, b) in enumerate(shown):
        ser_p = jser([a, b], pre); ser_c = jser([a, b], cur)
        ov = n = 0
        for d in days:
            legs, fb, his = DAYS[d]
        print(f"\n===== PAIR {i + 1}: slip 1 {a}  +  slip 2 {b} =====")
        print("HISTORY    :", RJ.fmt(RJ.stats(ser_p, pre)))
        print("2024-25    :", RJ.fmt(RJ.stats(ser_p, s24)))
        print("2025-26    :", RJ.fmt(RJ.stats(ser_p, s25)))
        print("THIS SEASON:", RJ.fmt(RJ.stats(ser_c, cur)))
        # leg overlap with his slips
        shared = tot = 0
        for d in days:
            legs, fb, his = DAYS[d]
            for r in (a, b):
                try:
                    s = P3.build_distinct(legs, 4, r, fb)
                except Exception:
                    s = None
                if s:
                    for l in s:
                        tot += 1; shared += FE.lk(l) in his
        print(f"LEGS ALSO IN HIS SLIPS OF THE DAY (if built alone): {100 * shared / max(tot, 1):.0f}%")
        if i < 2:
            print("DAY BY DAY THIS SEASON (date, slips, profit at $1):")
            for d in cur:
                if d in ser_c:
                    print("   ", d, len(ser_c[d]), round(sum(ser_c[d]), 2))
    print("\nB4 alone history:", RJ.fmt(RJ.stats(VAR[B4], pre)), "| this season:", RJ.fmt(RJ.stats(VAR[B4], cur)))


if __name__ == "__main__":
    main()
