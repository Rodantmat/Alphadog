#!/usr/bin/env python3
"""
JESSI PRIZEPICKS v6 (owner 2026-11-06 23:25): Pair 4 is live (J1, J2). What if slips are ADDED? Third and fourth slip from a wide grid (3F 3P 4F 5F, regular lines), built after J1 and J2
(players never repeated), never an exact copy of his / the friend's slip. History per season + this season. READ-ONLY.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ
import research_jessi_pp3 as P3

J1 = ("R", "B", "lowvol", "trail", 0.64, 1, 0, "high")
J2 = ("R", "B", "lowvol", "p", 0.64, 1, 0, "all")
GRID = list(itertools.product(("R",), ("B", "U", "O"), ("lowvol", "all", "points", "rebounds", "assists", "combos"), ("trail", "p", "blend", "ev"), (0.58, 0.60, 0.62, 0.64, 0.66, 0.70), (1, 2), (0, 1, 2), ("all", "low", "high")))
SHAPES = [(3, "flex"), (3, "power"), (4, "flex"), (5, "flex")]


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    DAYS = {}
    for season, d, legs in FE.pp_days(conn):
        if len(legs) < 3:
            continue
        H = FE.proxies(legs)
        DAYS[d] = (legs, P3.forbidden(legs, H))
    conn.close()
    days = sorted(DAYS)
    cur = [d for d in days if str(d) >= "2026-08-01"]; pre = [d for d in days if str(d) < "2026-08-01"]
    s24 = [d for d in pre if str(d) < "2025-08-01"]; s25 = [d for d in pre if str(d) >= "2025-08-01"]
    print(f"{len(days)} slates; this season {len(cur)}", flush=True)

    def jser(rules, dsel):
        out = {}
        for d in dsel:
            legs, fb = DAYS[d]
            xs = P3.joint(legs, rules, fb)
            if xs:
                out[d] = xs
        return out
    base = [(4, "flex", J1), (4, "flex", J2)]

    def show(label, rules):
        sp, sc = jser(rules, pre), jser(rules, cur)
        print(f"\n===== {label} =====")
        for k in rules[2:]:
            print("   added:", k[0], k[1], k[2])
        print("HISTORY    :", RJ.fmt(RJ.stats(sp, pre)))
        print("2024-25    :", RJ.fmt(RJ.stats(jser(rules, s24), s24)))
        print("2025-26    :", RJ.fmt(RJ.stats(jser(rules, s25), s25)))
        print("THIS SEASON:", RJ.fmt(RJ.stats(sc, cur)))
    show("PAIR 4 (live)", base)
    # candidate third slips: standalone must be positive in both seasons, then evaluated AFTER J1 J2
    rng = random.Random(11)
    cands = []
    for size, st in SHAPES:
        for v in rng.sample(GRID, 450):
            cands.append((size, st, v))
    SER = {}
    for c in cands:
        ser = {}
        for d in pre:
            legs, fb = DAYS[d]
            try:
                xs = P3.joint(legs, base + [c], fb)
            except Exception:
                xs = None
            if xs:
                ser[d] = xs
        SER[c] = ser
    scored = []
    for c, ser in SER.items():
        st = RJ.stats(ser, pre); a = RJ.stats(ser, s24); b = RJ.stats(ser, s25)
        if not st or not a or not b or a["roi"] < 0.4 or b["roi"] < 0.4:
            continue
        scored.append(((1 - st["loss"]) ** 2 * st["roi"] ** 0.5 / (1 + st["dd"] / 10), c))
    scored.sort(reverse=True)
    seen, top = set(), []
    for sc_, c in scored:
        sig = tuple(sorted((d, round(sum(x), 3)) for d, x in SER[c].items()))
        if sig in seen:
            continue
        seen.add(sig); top.append(c)
        if len(top) == 5:
            break
    for i, c in enumerate(top):
        show(f"PAIR 4 + 3rd slip option {i + 1}", base + [c])
    # fourth slip after the best 3 options
    for i, c3 in enumerate(top[:2]):
        res = []
        for c in [x for x in cands if x != c3][:900]:
            ser = {}
            for d in pre:
                legs, fb = DAYS[d]
                try:
                    xs = P3.joint(legs, base + [c3, c], fb)
                except Exception:
                    xs = None
                if xs:
                    ser[d] = xs
            st = RJ.stats(ser, pre); a = RJ.stats(ser, s24); b = RJ.stats(ser, s25)
            if st and a and b and a["roi"] >= 0.4 and b["roi"] >= 0.4:
                res.append(((1 - st["loss"]) ** 2 * st["roi"] ** 0.5 / (1 + st["dd"] / 10), c))
        res.sort(reverse=True)
        if res:
            show(f"PAIR 4 + 3rd option {i + 1} + 4th slip", base + [c3, res[0][1]])


if __name__ == "__main__":
    main()
