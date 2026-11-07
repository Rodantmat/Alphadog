#!/usr/bin/env python3
"""
OWNER PP combo (owner 2026-11-07 09:32): his set WITHOUT B6 + Jessi's 3 slips "switched a little" + the 5-pick Flex (R B lowvol p 0.62 gc1 tp0 line-high). READ-ONLY, flat $1.
 1. exact Jessi set (J1 J2 J3) + 5F ; 2. variants of J1 J2 J3 (one or two rule changes each) chosen on the first 60% by set ROI with drawdown not above the base's; read on last 40% / per season.
"""
import os, sys, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ
import research_owner_pp as RO
import research_owner_pp2 as R2

BASE = RO.BASE
F5 = ("R", "B", "lowvol", "p", 0.62, 1, 0, "high")


def variants(rule):
    pool, side, ps, rk, fl, gc, tp, lp = rule
    out = {rule}
    for f in (0.58, 0.60, 0.62, 0.64, 0.66, 0.68, 0.70):
        out.add((pool, side, ps, rk, f, gc, tp, lp))
    for r in ("p", "trail", "blend", "ev"):
        out.add((pool, side, ps, r, fl, gc, tp, lp))
    for l in ("all", "low", "high"):
        out.add((pool, side, ps, rk, fl, gc, tp, l))
    for t in (0, 1, 2):
        out.add((pool, side, ps, rk, fl, gc, t, lp))
    for g in (1, 2):
        out.add((pool, side, ps, rk, fl, g, tp, lp))
    # two-change neighbours
    for f in (0.60, 0.64, 0.68):
        for l in ("all", "low", "high"):
            out.add((pool, side, ps, rk, f, gc, tp, l))
        for r in ("p", "trail", "blend"):
            out.add((pool, side, ps, r, f, gc, tp, lp))
    return sorted(out, key=str)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    conn.execute("SET statement_timeout = 0")
    FE.PC.SE.flex_alt_tiers(); FE.PC.SE.payout_v3_rules()
    DAYS = {}
    for season, d, legs in FE.pp_days(conn):
        if len(legs) >= 3:
            DAYS[d] = legs
    conn.close()
    days = sorted(DAYS)
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]; test = [d for d in days if d >= cut]
    seas = lambda d: str(d)[:4] if str(d)[5:7] >= "08" else str(int(str(d)[:4]) - 1)
    seasons = sorted({seas(d) for d in days})
    comb = RO.comb
    print(f"{len(days)} slates, train {len(train)}, test {len(test)}", flush=True)

    def report(label, parts, indent="  "):
        ser = comb(parts, days)
        print(f"{indent}{label}")
        print(f"{indent}  ALL  :", RJ.fmt(RJ.stats(ser, days)))
        print(f"{indent}  TEST :", RJ.fmt(RJ.stats(ser, test)))
        for sy in seasons:
            print(f"{indent}  {sy} :", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))

    U = {u: RO.series_of(DAYS, days, u) for u in BASE if u != "B6"}
    bp = [U[u] for u in U]
    f5 = {}
    for d in days:
        try:
            s = R2.build_ind(DAYS[d], F5, 5)
        except Exception:
            s = None
        if s:
            f5[d] = RJ.pay(s, "flex") - 1.0

    def jparts(rules):
        """three Jessi-style slips built one after the other (players not repeated), as the page builds them; returns 3 day-dicts"""
        parts = [dict() for _ in rules]
        for d in days:
            used = set()
            for i, (size, rule) in enumerate(rules):
                try:
                    s = R2.build_ind(DAYS[d], rule, size, frozenset(used))
                except Exception:
                    s = None
                if s:
                    parts[i][d] = RJ.pay(s, "flex") - 1.0
                    used |= {FE.pid(l) for l in s}
        return parts

    J = [(sz, r) for c, sz, st, r in FE.JESSI_RULES["PP"]]
    print("\nJessi rules:", J)
    report("BASE: his set without B6", bp)
    report("BASE + 5F", bp + [f5])
    jp = jparts(J)
    report("BASE + Jessi exact (J1 J2 J3)", bp + jp)
    report("BASE + Jessi exact + 5F", bp + jp + [f5])
    btr = RJ.stats(comb(bp + jp + [f5], train), train)
    # variants per slip, screened standalone on train, top 6 each
    top = []
    for i, (sz, r) in enumerate(J):
        rows = []
        seen = set()
        for v in variants(r):
            ser = {}
            for d in days:
                try:
                    s = R2.build_ind(DAYS[d], v, sz)
                except Exception:
                    s = None
                if s:
                    ser[d] = RJ.pay(s, "flex") - 1.0
            if len(ser) < 0.4 * len(days):
                continue
            sig = tuple(sorted((d, round(x, 3)) for d, x in ser.items()))
            if sig in seen:
                continue
            seen.add(sig)
            p = RJ.stats(comb(bp + [f5, ser], train), train)
            if p:
                rows.append((p["roi"], v))
        rows.sort(key=lambda x: -x[0])
        top.append([v for _, v in rows[:6]] + ([r] if r not in [v for _, v in rows[:6]] else []))
        print(f"slip {i + 1}: {len(rows)} variants, keeping {len(top[-1])}", flush=True)
    res = []
    for combo in itertools.product(*top):
        if combo == tuple(r for _, r in J):
            continue
        # at least one slip changed, but not more than all three identical to base: fine
        rules = [(J[i][0], combo[i]) for i in range(3)]
        parts = jparts(rules)
        p = RJ.stats(comb(bp + parts + [f5], train), train)
        if p:
            res.append((p, combo, parts))
    print(f"combos evaluated: {len(res)}; train exact-Jessi+5F ROI {btr['roi'] * 100:.1f}% dd {btr['dd']:.1f} losing {btr['loss'] * 100:.1f}%")
    ok = [r for r in res if r[0]["dd"] <= btr["dd"] + 0.01 and r[0]["loss"] <= btr["loss"] + 0.005 and r[0]["roi"] >= btr["roi"]]
    ok.sort(key=lambda r: -r[0]["roi"])
    print(f"variants with ROI up, drawdown and losing days not worse: {len(ok)}")
    for p, combo, parts in ok[:6]:
        report("VARIANT " + " | ".join(str(c) for c in combo), bp + parts + [f5], "  ")
    low = sorted(res, key=lambda r: (r[0]["dd"], r[0]["loss"]))
    low = [r for r in low if r[0]["roi"] >= 0.97 * btr["roi"]][:3]
    print("-- lowest drawdown within 3% of the exact set's train ROI:")
    for p, combo, parts in low:
        report("VARIANT " + " | ".join(str(c) for c in combo), bp + parts + [f5], "  ")


if __name__ == "__main__":
    main()
