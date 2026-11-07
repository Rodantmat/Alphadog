#!/usr/bin/env python3
"""
OWNER PRIZEPICKS SAFER ADDITIONS (owner 2026-11-07: "drop b6 is one, but I need safer additions, it may be the same of my friend and/or Jessica"). READ-ONLY, flat $1.
Bases: A = his set (B3 B4 B5 B6 B7 B9), B = without B6. Additions may be exactly the same slips as the friend's / Jessi's (no blocking).
 1. whole Jessi set (J1 J2 J3 as the page builds them) and whole friend set added
 2. single extra slips from a wide grid (shapes 3F 3P 4F 4P 5F 6F, line position all/low/high): kept when ROI up and drawdown / losing days not worse (selection on the first 60%)
 3. best pairs of extras
Read on the last 40% and per season.
"""
import os, sys, random, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ
import research_owner_pp as RO

PB = FE.PB
BASE = RO.BASE
SHAPES = [(3, "flex"), (3, "power"), (4, "flex"), (4, "power"), (5, "flex"), (6, "flex")]
NV = int(os.environ.get("JV") or 500)
PS = ("all", "points", "rebounds", "assists", "threes", "combos", "lowvol")
GRID = list(itertools.product(("R", "RD"), ("O", "U", "B"), PS, ("p", "ev", "blend", "trail"), (0.58, 0.62, 0.66, 0.70, 0.74), (1, 2, 3), (0, 1, 2), ("all", "low", "high")))


def build_ind(legs, rule, size, banned=frozenset()):
    cand, gc = FE.pp_cand(legs, rule)
    return FE.build_at(cand, size, gc, set(), frozenset(banned), True, 0)


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
    print(f"{len(days)} slates, train {len(train)}, test {len(test)}", flush=True)
    comb = RO.comb

    def report(label, parts, indent="  "):
        ser = comb(parts, days)
        print(f"{indent}{label}")
        print(f"{indent}  ALL  :", RJ.fmt(RJ.stats(ser, days)))
        print(f"{indent}  TEST :", RJ.fmt(RJ.stats(ser, test)))
        for sy in seasons:
            print(f"{indent}  {sy} :", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))

    U = {u: RO.series_of(DAYS, days, u) for u in BASE}
    # whole Jessi set and whole friend set as day series (profit lists flattened to per-slip entries)
    JES, FRI = {}, {}
    for d in days:
        legs = DAYS[d]
        used, xs = set(), []
        for code, size, st, rule in FE.JESSI_RULES["PP"]:
            try:
                s = build_ind(legs, rule, size, frozenset(used))
            except Exception:
                s = None
            if s:
                xs.append(RJ.pay(s, st) - 1.0); used |= {FE.pid(l) for l in s}
        if xs:
            JES[d] = xs
        try:
            fp, _k = RJ.friend_day(legs, FE.proxies(legs))
        except Exception:
            fp = None
        if fp:
            FRI[d] = fp
    # series as lists per day: parts are dict day->float; wrap lists as separate parts by index
    def lists_to_parts(S):
        mx = max(len(v) for v in S.values())
        return [{d: v[i] for d, v in S.items() if len(v) > i} for i in range(mx)]
    JP, FP = lists_to_parts(JES), lists_to_parts(FRI)

    bases = {"A his set": [U[u] for u in BASE], "B without B6": [U[u] for u in BASE if u != "B6"]}
    for bn, bp in bases.items():
        print(f"\n################ BASE {bn} ################")
        report("base", bp)
        report("+ Jessi's whole set (J1 J2 J3)", bp + JP)
        report("+ friend's whole set", bp + FP)
    # singles
    cands = []
    seen = set()
    for si, (size, st) in enumerate(SHAPES):
        gs = random.Random(90 + si).sample(GRID, min(NV, len(GRID)))
        for g in gs:
            ser = {}
            for d in days:
                try:
                    s = build_ind(DAYS[d], g, size)
                except Exception:
                    s = None
                if s:
                    ser[d] = RJ.pay(s, st) - 1.0
            if len(ser) < 0.4 * len(days):
                continue
            sig = tuple(sorted((d, round(x, 3)) for d, x in ser.items()))
            if sig in seen:
                continue
            seen.add(sig)
            cands.append((size, st, g, ser))
        print(f"  shape {size}-{st} done, kept {len(cands)}", flush=True)
    for bn, bp in bases.items():
        b = RJ.stats(comb(bp, train), train)
        print(f"\n################ SINGLE ADDITIONS on BASE {bn} (train ROI {b['roi'] * 100:.1f}% dd {b['dd']:.1f} losing {b['loss'] * 100:.1f}%) ################", flush=True)
        rows = []
        for size, st, g, ser in cands:
            p = RJ.stats(comb(bp + [ser], train), train)
            if p:
                rows.append((p, size, st, g, ser))
        safe = [r for r in rows if r[0]["roi"] >= b["roi"] and r[0]["dd"] <= b["dd"] and r[0]["loss"] <= b["loss"] + 0.003]
        print(f"  ROI up, drawdown and losing days not worse: {len(safe)} of {len(rows)}")
        safe.sort(key=lambda r: -r[0]["roi"])
        for p, size, st, g, ser in safe[:6]:
            report(f"ADD {size}-{st} {g} (alone {RJ.fmt(RJ.stats(comb([ser], days), days))})", bp + [ser], "    ")
        low = [r for r in rows if r[0]["roi"] >= 0.97 * b["roi"]]
        low.sort(key=lambda r: (r[0]["dd"], r[0]["loss"]))
        print("  -- lowest drawdown among additions keeping ROI within 3% of base:")
        for p, size, st, g, ser in low[:4]:
            report(f"ADD {size}-{st} {g}", bp + [ser], "    ")
        # pairs from the best 14 by train calmar among rows with roi >= base
        top = sorted([r for r in rows if r[0]["roi"] >= 0.95 * b["roi"]], key=lambda r: -r[0]["calmar"])[:14]
        pr = []
        for (i, r1), (j, r2) in itertools.combinations(list(enumerate(top)), 2):
            p = RJ.stats(comb(bp + [r1[4], r2[4]], train), train)
            if p and p["roi"] >= b["roi"] and p["dd"] <= b["dd"] and p["loss"] <= b["loss"] + 0.003:
                pr.append((p["roi"], r1, r2))
        pr.sort(key=lambda x: -x[0])
        print(f"  -- pairs of additions (ROI up, drawdown and losing days not worse): {len(pr)}")
        for roi, r1, r2 in pr[:4]:
            report(f"ADD {r1[1]}-{r1[2]} {r1[3]} + {r2[1]}-{r2[2]} {r2[3]}", bp + [r1[4], r2[4]], "    ")


if __name__ == "__main__":
    main()
