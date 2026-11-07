#!/usr/bin/env python3
"""
OWNER PRIZEPICKS ROI SEARCH (owner 2026-11-07: "What about my strategies? Anything to make it increase my ROI?"). READ-ONLY, flat $1 a slip, real PrizePicks payouts.
His set = the certified Portfolio B units B3 B4 B5 B6 B7 B9 (as modelled, same machinery as the live pick: PB.unit_slip).
 1. baseline by season / out of sample (last 40%) / this season
 2. leave-one-out (drop a unit)
 3. same legs, other entry type (swap a unit's structure)
 4. add-one: a new independent slip from a wide rule grid (6 shapes), set ROI vs baseline
 5. replace-one: neighbours of each unit's rule (floor, rank, side, game cap, skip), set ROI vs baseline
Selection on the first 60% of slates, read on the last 40% and per season. Nothing is changed live by this script.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ

PB = FE.PB
random.seed(11)
BASE = ["B3", "B4", "B5", "B6", "B7", "B9"]
SHAPES = [(3, "flex"), (3, "power"), (4, "flex"), (4, "power"), (5, "flex"), (6, "flex")]
NV = int(os.environ.get("JV") or 450)
PS = ("all", "points", "rebounds", "assists", "threes", "combos", "lowvol")
ADDGRID = list(itertools.product(("R", "RD"), ("O", "U", "B"), PS, ("p", "ev", "blend", "trail"), (0.58, 0.62, 0.66, 0.70, 0.74), (1, 2, 3), (0, 1, 2)))


def series_of(DAYS, days, uid, size=None, st=None):
    out = {}
    kind, prm, sz, stt = PB.UNITS[uid]
    sz = size or sz; stt = st or stt
    for d in days:
        try:
            c, gc, pc = PB.candidates(DAYS[d], uid)
            s = PB.select(c, gc, pc, sz)
        except Exception:
            s = None
        if s:
            out[d] = RJ.pay(s, stt) - 1.0
    return out


def comb(parts, days):
    out = {}
    for d in days:
        xs = [p[d] for p in parts if d in p]
        if xs:
            out[d] = xs
    return out


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
    print(f"{len(days)} slates, train {len(train)} (to {cut}), test {len(test)}", flush=True)

    def report(label, parts, indent=""):
        ser = comb(parts, days)
        print(f"{indent}{label}")
        print(f"{indent}  ALL  :", RJ.fmt(RJ.stats(ser, days)))
        print(f"{indent}  TEST :", RJ.fmt(RJ.stats(ser, test)))
        for sy in seasons:
            print(f"{indent}  {sy} :", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))

    U = {u: series_of(DAYS, days, u) for u in BASE}
    print("\n===== 1. HIS SET (B3 B4 B5 B6 B7 B9) =====")
    report("baseline", [U[u] for u in BASE])
    base_tr = RJ.stats(comb([U[u] for u in BASE], train), train)
    for u in BASE:
        k = PB.UNITS[u]
        print(f"  unit {u} {k[2]}-{k[3]} alone: ALL", RJ.fmt(RJ.stats(comb([U[u]], days), days)), "| TEST", RJ.fmt(RJ.stats(comb([U[u]], test), test)))

    print("\n===== 2. LEAVE ONE OUT =====")
    for u in BASE:
        report(f"without {u}", [U[v] for v in BASE if v != u])

    print("\n===== 3. SAME LEGS, OTHER ENTRY TYPE =====")
    for u in BASE:
        k = PB.UNITS[u]
        for size, st in ((3, "flex"), (4, "flex"), (4, "power"), (5, "flex"), (6, "flex")):
            if (size, st) == (k[2], k[3]):
                continue
            alt = series_of(DAYS, days, u, size, st)
            ser = comb([alt if v == u else U[v] for v in BASE], days)
            a = RJ.stats(ser, days); t = RJ.stats(ser, test)
            print(f"  {u} {k[2]}-{k[3]} -> {size}-{st}: ALL {RJ.fmt(a)} | TEST ROI {t['roi'] * 100:.1f}%")

    # temp unit ids for grid variants
    def mk(rule, size, st, name):
        PB.UNITS[name] = ("b1", rule, size, st)

    print("\n===== 4. ADD ONE (independent extra slip, set ROI) =====", flush=True)
    cands = []
    seen = set()
    for si, (size, st) in enumerate(SHAPES):
        gs = random.Random(70 + si).sample(ADDGRID, min(NV, len(ADDGRID)))
        for gi, g in enumerate(gs):
            name = f"A{si}_{gi}"
            mk(g, size, st, name)
            ser = series_of(DAYS, days, name)
            if len(ser) < 0.4 * len(days):
                continue
            sig = tuple(sorted((d, round(x, 3)) for d, x in ser.items()))
            if sig in seen:
                continue
            seen.add(sig)
            tot = comb([U[v] for v in BASE] + [ser], train)
            st_ = RJ.stats(tot, train)
            if st_:
                cands.append((st_["roi"], st_["calmar"], name, size, st, g, ser))
        print(f"  shape {size}-{st} done, kept {len(cands)}", flush=True)
    b_roi, b_cal = base_tr["roi"], base_tr["calmar"]
    ok = [c for c in cands if c[0] > b_roi and c[1] >= 0.95 * b_cal]
    ok.sort(key=lambda c: -c[0])
    print(f"  train baseline ROI {b_roi * 100:.1f}% calmar {b_cal:.1f}; candidates raising ROI without hurting calmar: {len(ok)} of {len(cands)}")
    for roi, cal, name, size, st, g, ser in ok[:10]:
        report(f"ADD {size}-{st} {g}  (alone: {RJ.fmt(RJ.stats(comb([ser], days), days))})", [U[v] for v in BASE] + [ser], "  ")

    print("\n===== 5. REPLACE ONE (neighbours of each unit's rule) =====", flush=True)
    for u in ("B4", "B5", "B7", "B9", "B6", "B3"):
        kind, prm, size, st = PB.UNITS[u]
        rows = []
        if kind == "b1":
            pool, side, ps, rk, mp, gc, tp = prm
            grid = list(itertools.product((pool,), ("O", "U", "B"), (ps,), ("p", "ev", "blend", "trail"), (0.58, 0.62, 0.66, 0.70, 0.74, 0.78), (1, 2, 3), (0, 1, 2)))
        elif kind == "f":
            th, sd, bn = prm
            grid = None
        else:
            grid = None
        if grid is None:
            print(f"  {u}: kind {kind} not searched")
            continue
        sig_seen = set()
        for gi, g in enumerate(grid):
            name = f"R_{u}_{gi}"
            mk(g, size, st, name)
            ser = series_of(DAYS, days, name)
            if len(ser) < 0.4 * len(days):
                continue
            sig = tuple(sorted((d, round(x, 3)) for d, x in ser.items()))
            if sig in sig_seen:
                continue
            sig_seen.add(sig)
            tot = comb([ser if v == u else U[v] for v in BASE], train)
            s2 = RJ.stats(tot, train)
            if s2:
                rows.append((s2["roi"], s2["calmar"], g, ser))
        ok = [r for r in rows if r[0] > b_roi and r[1] >= 0.95 * b_cal and r[2] != prm]
        ok.sort(key=lambda r: -r[0])
        print(f"  {u} {size}-{st} current {prm}: {len(ok)} neighbours raise train ROI without hurting calmar (of {len(rows)})", flush=True)
        for roi, cal, g, ser in ok[:4]:
            report(f"REPLACE {u} -> {g}", [ser if v == u else U[v] for v in BASE], "    ")


if __name__ == "__main__":
    main()
