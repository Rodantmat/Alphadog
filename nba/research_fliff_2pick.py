#!/usr/bin/env python3
"""
FLIFF 2-PICK ONLY (owner 2026-11-07: "I rather 2 pick for fliff and the same for Jessica"). Derived from JESSI FLIFF SEARCH (owner 2026-11-07: "Jessica needs fliff strategy"). Run with FR_APP=FLIFF. READ-ONLY, flat $1, Fliff Max payouts (the engine's own).
Her slips may be exactly his / the friend's. Shapes 2,3,4 and 5 picks (Max). Rule grid = the engine's Fliff rule family (rank p/ev/bl/evbl/edge, side, low-volume filter, floor, p*m gate, skip).
Phase 1 standalone on the first 60% of slates; phase 2 joint greedy up to 3 slips (one after the other, players not repeated); read on the last 40% and per season. Sleeper/Fliff history before Oct 2026 is modelled boards.
"""
import os, sys, random, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import psycopg
import friend_engine as FE
import research_jessi as RJ

random.seed(21)
SHAPES = [(2, "max")]
GRID = [(o, sd, pr, "main", fl, gt, sk) for o, sd, pr, fl, gt, sk in itertools.product(
    ("p", "ev", "bl", "evbl", "edge"), ("any", "Over", "Under"), ("all", "low", "nolow"), (0.0, 0.50, 0.55, 0.60, 0.65), (0.0, 1.0, 1.04, 1.10), (0, 1, 2))]


def one(legs, size, rule, banned=frozenset()):
    cand = FE.ranked(legs, rule)
    return FE.build_at(cand, size, 1, set(), frozenset(banned), False, 0)


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"]); conn.execute("SET statement_timeout = 0")
    DAYS, OWN, FRI = {}, {}, {}
    for season, d, legs in FE.app_days(conn):
        if len(legs) < 2:
            continue
        DAYS[d] = legs
        o = RJ.owner_series(legs)
        if o: OWN[d] = o
        H = FE.proxies(legs)
        fp, _k = RJ.friend_day(legs, H)
        if fp: FRI[d] = fp
    conn.close()
    days = sorted(DAYS)
    cut = days[int(len(days) * 0.6)]
    train = [d for d in days if d < cut]; test = [d for d in days if d >= cut]
    cur = [d for d in days if str(d) >= "2026-10-01"]
    seas = lambda d: str(d)[:4] if str(d)[5:7] >= "08" else str(int(str(d)[:4]) - 1)
    seasons = sorted({seas(d) for d in days})
    print(f"FLIFF {len(days)} slates, train {len(train)} (to {cut}), test {len(test)}, this season {len(cur)}", flush=True)

    def block(label, ser):
        print(label)
        print("  ALL  :", RJ.fmt(RJ.stats(ser, days)))
        print("  TEST :", RJ.fmt(RJ.stats(ser, test)))
        for sy in seasons:
            print(f"  {sy} :", RJ.fmt(RJ.stats(ser, [d for d in days if seas(d) == sy])))
        print("  THIS SEASON:", RJ.fmt(RJ.stats(ser, cur)))
    block("OWNER (as modelled)", OWN)
    block("FRIEND (base + extra)", FRI)
    VAR = collections.defaultdict(dict)
    for si, (size, st) in enumerate(SHAPES):
        for v in random.Random(40 + si).sample(GRID, min(500, len(GRID))):
            for d in days:
                try:
                    s = one(DAYS[d], size, v)
                except Exception:
                    s = None
                if s:
                    VAR[(size, st, v)][d] = [RJ.pay(s, st) - 1.0]
        print(f"shape {size}-{st} done, variants {len(VAR)}", flush=True)
    seen, cands = set(), []
    for k, ser in VAR.items():
        sig = tuple(sorted((d, round(v[0], 4)) for d, v in ser.items()))
        if sig in seen:
            continue
        seen.add(sig)
        a = RJ.stats(ser, train)
        if a and a["days"] >= 0.4 * len(train) and a["roi"] >= 0.15:
            cands.append(((1 - a["loss"]) ** 2 * max(a["roi"], 0.01) ** 0.5 * (1 + a["calmar"]) ** 0.3, k))
    cands.sort(reverse=True)
    fin = [k for _, k in cands[:80]]
    print("finalists", len(fin), "of", len(cands))
    for k in fin[:12]:
        print("  ", k[0], k[2], "TRAIN", RJ.fmt(RJ.stats(VAR[k], train)), "| TEST", RJ.fmt(RJ.stats(VAR[k], test)))

    def jseries(rules, dsel):
        out = {}
        for d in dsel:
            used, xs = set(), []
            for size, st, v in rules:
                try:
                    s = one(DAYS[d], size, v, frozenset(used))
                except Exception:
                    s = None
                if s:
                    xs.append(RJ.pay(s, st) - 1.0); used |= {FE.pid(l) for l in s}
            if xs:
                out[d] = xs
        return out

    def run_set(label, minroi, maxn, wl):
        chosen = []
        for _ in range(maxn):
            curs = RJ.stats(jseries([(k[0], k[1], k[2]) for k in chosen], train), train) if chosen else None
            best = None
            for k in fin:
                if k in chosen: continue
                p = RJ.stats(jseries([(c[0], c[1], c[2]) for c in chosen + [k]], train), train)
                if not p or p["roi"] < minroi: continue
                sc = (1 - p["loss"]) ** wl * max(p["roi"], 0.01) ** 0.5 * (1 + p["calmar"]) ** 0.3
                if curs and sc <= (1 - curs["loss"]) ** wl * max(curs["roi"], 0.01) ** 0.5 * (1 + curs["calmar"]) ** 0.3: continue
                if best is None or sc > best[0]: best = (sc, k)
            if not best: break
            chosen.append(best[1])
        print(f"\n===== SET {label}: min train ROI {minroi}, up to {maxn} slips =====")
        for k in chosen: print("  ", k[0], "-", k[1], k[2])
        ser = jseries([(k[0], k[1], k[2]) for k in chosen], days)
        block("RESULT", ser)
        return chosen
    run_set("A fewest losing days", 0.20, 3, 3)
    run_set("B balanced", 0.35, 3, 2)
    run_set("C more ROI", 0.50, 3, 1)
    F3M = (2, "max", ("bl", "Under", "low", "main", 0.6, 1.04, 0)); FX1 = (2, "max", ("edge", "any", "low", "main", 0.6, 1.04, 1))
    HIS = (2, "max", ("p", "Under", "all", "main", 0.56, 0.0, 0))
    print("\n===== FIXED 2-PICK SETS =====")
    block("his own rule, 2-pick (1 slip)", jseries([HIS], days))
    block("friend rule 3M as 2-pick (1 slip)", jseries([F3M], days))
    block("friend rule X1 as 2-pick (1 slip)", jseries([FX1], days))
    block("friend 3M2 + X1_2 (2 slips, players not repeated)", jseries([F3M, FX1], days))
    block("his own + 3M2 + X1_2 (3 slips)", jseries([HIS, F3M, FX1], days))
    J2 = (2, "max", ("edge", "any", "low", "main", 0.6, 1.04, 2)); J1b = (2, "max", ("bl", "any", "low", "main", 0.55, 1.0, 0))
    block("Jessi's live pair as 2-picks: J1 bl + J2 edge (2 slips)", jseries([J1b, J2], days))


if __name__ == "__main__":
    main()
